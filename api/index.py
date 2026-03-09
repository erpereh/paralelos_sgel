from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import pandas as pd
import numpy as np
from io import BytesIO
import base64
from openpyxl import Workbook
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from typing import List

app = FastAPI()


def clean_dni(value) -> str:
    """Normalize DNI/ID: strip whitespace, uppercase, remove leading zeros.
    Handles pandas float conversion (10008.0 -> '10008').
    """
    if pd.isna(value):
        return ""
    # If it's a float that is really an integer (e.g. 10008.0), convert to int first
    if isinstance(value, float) and value == int(value):
        value = int(value)
    s = str(value).strip().upper()
    # Remove dashes and spaces (but NOT dots yet — they were handled above)
    s = s.replace("-", "").replace(" ", "")
    # If there's a trailing ".0" still (from string-typed "10008.0"), remove it
    if s.endswith(".0") and s[:-2].isdigit():
        s = s[:-2]
    # If the entire string is numeric, strip leading zeros
    if s.isdigit():
        s = s.lstrip("0") or "0"
    # If the string ends with a letter but the rest is numeric (like a Spanish DNI),
    # strip leading zeros from the numeric part.
    elif len(s) > 1 and s[:-1].isdigit():
        numeric_part = s[:-1].lstrip("0") or "0"
        s = numeric_part + s[-1]
    return s


def safe_float(val):
    if pd.isna(val):
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


def find_column(df, possible_names, required=False, exact=False):
    """
    Find a column in df based on a list of possible names.
    If exact=True, it checks for case-insensitive exact match.
    If exact=False, it checks if any of the possible names are a substring of the column name.
    """
    cols_upper = {c: c.upper() for c in df.columns}
    for p in possible_names:
        p_up = p.upper()
        for orig_col, up_col in cols_upper.items():
            if exact:
                if p_up == up_col:
                    return orig_col
            else:
                if p_up in up_col:
                    return orig_col
    
    if required:
        available = list(df.columns)
        raise HTTPException(
            status_code=400, 
            detail=f"No se encontró una columna válida para {possible_names[0]}. Las columnas disponibles son: {available}"
        )
    return None

# ──────────────────────────────────────────────────────────────
# ENDPOINT 1: /api/process — Upload + clean + drop_duplicates + merge
# ──────────────────────────────────────────────────────────────
@app.post("/api/process")
async def process_payroll(
    file_xrp: UploadFile = File(...),
    file_meta4: UploadFile = File(...),
):
    try:
        # ==========================================
        # 1. READ AND CLEAN XRP
        # ==========================================
        xrp_bytes = await file_xrp.read()
        df_xrp = pd.read_excel(BytesIO(xrp_bytes), skiprows=4, engine="openpyxl")
        
        # Limpieza radical de nombres de columnas
        df_xrp.columns = df_xrp.columns.astype(str).str.strip().str.replace('\n', ' ').str.replace('\r', '')

        # Buscar columnas XRP
        XRP_COL_ID = find_column(df_xrp, ["Trabajador", "DNI trabajador", "DNI"], required=True)
        XRP_COL_NOMBRE = find_column(df_xrp, ["Nombre trabajador", "Nombre"], required=True)
        XRP_COL_DEVENGOS = find_column(df_xrp, ["Total Devengado", "Devengos"], required=True)
        XRP_COL_DEDUCCIONES = find_column(df_xrp, ["Deducciones", "Retenciones", "Retenido"], required=False)
        XRP_COL_LIQUIDO = find_column(df_xrp, ["Liquido", "Neto", "Percibir"], required=False)
        XRP_COL_CONVENIO = find_column(df_xrp, ["Convenio"], required=False)

        xrp_data = pd.DataFrame()
        xrp_data["dni_clean"] = df_xrp[XRP_COL_ID].apply(clean_dni)
        xrp_data["id_xrp"] = df_xrp[XRP_COL_ID].apply(clean_dni)
        xrp_data["nombre_xrp"] = df_xrp[XRP_COL_NOMBRE].astype(str).str.strip()
        xrp_data["devengos_xrp"] = df_xrp[XRP_COL_DEVENGOS].apply(safe_float)
        
        if XRP_COL_DEDUCCIONES:
            xrp_data["deducciones_xrp"] = df_xrp[XRP_COL_DEDUCCIONES].apply(safe_float)
        else:
            xrp_data["deducciones_xrp"] = 0.0
            
        if XRP_COL_LIQUIDO:
            xrp_data["liquido_xrp"] = df_xrp[XRP_COL_LIQUIDO].apply(safe_float)
        else:
            xrp_data["liquido_xrp"] = 0.0
            
        if XRP_COL_CONVENIO:
            xrp_data["convenio_xrp"] = df_xrp[XRP_COL_CONVENIO].apply(clean_dni)
        else:
            xrp_data["convenio_xrp"] = ""

        # Eliminar vacíos y duplicados estrictamente (XRP)
        xrp_data = xrp_data[xrp_data["dni_clean"] != ""]
        xrp_data = xrp_data.drop_duplicates(subset=['dni_clean'], keep='first')


        # ==========================================
        # 2. READ AND CLEAN META4
        # ==========================================
        meta4_bytes = await file_meta4.read()
        df_meta4 = pd.read_excel(BytesIO(meta4_bytes), skiprows=3, engine="openpyxl")
        
        # Limpieza radical de nombres de columnas
        df_meta4.columns = df_meta4.columns.astype(str).str.strip().str.replace('\n', ' ').str.replace('\r', '')

        # Buscar columnas Meta4
        META4_COL_ID = find_column(df_meta4, ["Empleado", "DNI", "Trabajador"], required=True)
        META4_COL_NOMBRE = find_column(df_meta4, ["Nombre"], required=True)
        META4_COL_EMPRESA = find_column(df_meta4, ["Centro_de_Trabajo", "Empresa", "Centro"], required=False)
        META4_COL_DEVENGOS = find_column(df_meta4, ["Total_Devengos", "Bruto", "Devengos"], required=True)
        META4_COL_DEDUCCIONES = find_column(df_meta4, ["Total.Retenido", "Deducciones", "Retenciones"], required=True)
        META4_COL_LIQUIDO = find_column(df_meta4, ["Liquido", "Neto", "Percibir"], required=True)
        META4_COL_CONVENIO = find_column(df_meta4, ["id.Convenio", "Convenio"], required=False)

        meta4_data = pd.DataFrame()
        meta4_data["dni_clean"] = df_meta4[META4_COL_ID].apply(clean_dni)
        meta4_data["id_meta4"] = df_meta4[META4_COL_ID].apply(clean_dni)

        # Nombre en Meta4 (intentando juntar apellidos si existen, o usar nombre directo)
        col_ap1 = find_column(df_meta4, ["Apellido_1", "Primer Apellido"])
        col_ap2 = find_column(df_meta4, ["Apellido_2", "Segundo Apellido"])
        
        if col_ap1:
            n_part = df_meta4[col_ap1].fillna("").astype(str).str.strip() + " "
            if col_ap2:
                n_part += df_meta4[col_ap2].fillna("").astype(str).str.strip() + ", "
            else:
                n_part += ", "
            n_part += df_meta4[META4_COL_NOMBRE].fillna("").astype(str).str.strip()
            
            meta4_data["nombre_meta4"] = n_part.str.strip().str.replace(r"^,\s*", "", regex=True)
        else:
            meta4_data["nombre_meta4"] = df_meta4[META4_COL_NOMBRE].astype(str).str.strip()

        if META4_COL_EMPRESA:
            meta4_data["empresa"] = df_meta4[META4_COL_EMPRESA].fillna("").astype(str).str.strip()
        else:
            meta4_data["empresa"] = ""
            
        meta4_data["devengos_meta4"] = df_meta4[META4_COL_DEVENGOS].apply(safe_float)
        meta4_data["deducciones_meta4"] = df_meta4[META4_COL_DEDUCCIONES].apply(safe_float)
        meta4_data["liquido_meta4"] = df_meta4[META4_COL_LIQUIDO].apply(safe_float)

        if META4_COL_CONVENIO:
            meta4_data["convenio_meta4"] = df_meta4[META4_COL_CONVENIO].apply(clean_dni)
        else:
            meta4_data["convenio_meta4"] = ""

        # Eliminar vacíos y duplicados estrictamente (Meta4)
        meta4_data = meta4_data[meta4_data["dni_clean"] != ""]
        meta4_data = meta4_data.drop_duplicates(subset=['dni_clean'], keep='first')


        # ==========================================
        # 3. MERGE (OUTER)
        # ==========================================
        df_merged = pd.merge(meta4_data, xrp_data, on="dni_clean", how="outer", indicator=True)

        result_rows = []
        for _, row in df_merged.iterrows():
            merge_status = row["_merge"] 
            
            # Preferir nombre/ID de Meta4 si existe, sino usar el de XRP
            nombre = str(row.get("nombre_meta4", "") if pd.notna(row.get("nombre_meta4")) else row.get("nombre_xrp", "")).strip()
            id_emp = str(row.get("id_meta4", "") if pd.notna(row.get("id_meta4")) else row.get("id_xrp", "")).strip()
            if not id_emp:
                id_emp = str(row["dni_clean"])
            
            empresa = str(row.get("empresa", "") if pd.notna(row.get("empresa")) else "").strip()

            # Forzar NaN a 0.0 mediante safe_float
            dev_xrp = safe_float(row.get("devengos_xrp"))
            ded_xrp = safe_float(row.get("deducciones_xrp"))
            liq_xrp = safe_float(row.get("liquido_xrp"))
            
            dev_m4 = safe_float(row.get("devengos_meta4"))
            ded_m4 = safe_float(row.get("deducciones_meta4"))
            liq_m4 = safe_float(row.get("liquido_meta4"))

            diferencia = round(liq_m4 - liq_xrp, 2)
            
            conv_xrp = str(row.get("convenio_xrp", "") if pd.notna(row.get("convenio_xrp")) else "").strip()
            conv_m4 = str(row.get("convenio_meta4", "") if pd.notna(row.get("convenio_meta4")) else "").strip()
            
            # Match strictly but ignore if both are missing
            if conv_xrp == "" and conv_m4 == "":
                conv_match = ""
            elif conv_xrp == conv_m4:
                conv_match = "COINCIDE"
            else:
                conv_match = "NO COINCIDE"

            result_rows.append({
                "nombre": nombre,
                "id_empleado": id_emp,
                "empresa": empresa,
                "devengos_xrp": round(dev_xrp, 2),
                "deducciones_xrp": round(ded_xrp, 2),
                "liquido_xrp": round(liq_xrp, 2),
                "devengos_meta4": round(dev_m4, 2),
                "deducciones_meta4": round(ded_m4, 2),
                "liquido_meta4": round(liq_m4, 2),
                "diferencia": diferencia,
                "convenio_xrp": conv_xrp,
                "convenio_meta4": conv_m4,
                "convenio_match": conv_match,
                "_merge": str(merge_status)
            })

        rows_with_diff = sum(1 for r in result_rows if abs(r["diferencia"]) > 0.01)

        return JSONResponse(content={
            "data": result_rows,
            "total_rows": len(result_rows),
            "rows_with_diff": rows_with_diff,
        })

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error procesando archivos: {str(e)}")


# ──────────────────────────────────────────────────────────────
# ENDPOINT 2: /api/generate-excel
# ──────────────────────────────────────────────────────────────
class RowData(BaseModel):
    nombre: str = ""
    id_empleado: str = ""
    empresa: str = ""
    devengos_xrp: float = 0
    deducciones_xrp: float = 0
    liquido_xrp: float = 0
    devengos_meta4: float = 0
    deducciones_meta4: float = 0
    liquido_meta4: float = 0
    diferencia: float = 0
    convenio_xrp: str = ""
    convenio_meta4: str = ""
    convenio_match: str = ""
    _merge: str = "" # ignore when exporting


class ExcelRequest(BaseModel):
    data: List[RowData]


@app.post("/api/generate-excel")
async def generate_excel(req: ExcelRequest):
    try:
        wb = Workbook()
        ws = wb.active
        ws.title = "Comparativa Nóminas"

        headers = [
            "Nombre", "ID Empleado", "Empresa",
            "Devengos XRP", "Deducciones XRP", "LÍQUIDO XRP",
            "Devengos META4", "Deducciones META4", "LÍQUIDO META4",
            "DIFERENCIA", "CONVENIO XRP", "CONVENIO META4"
        ]

        # Estilos visuales
        header_fill = PatternFill(start_color="1C4CB5", end_color="1C4CB5", fill_type="solid")
        header_font = Font(name="Calibri", bold=True, color="FFFFFF", size=11)
        header_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
        thin_border = Border(
            left=Side(style="thin"), right=Side(style="thin"),
            top=Side(style="thin"), bottom=Side(style="thin"),
        )
        diff_fill = PatternFill(start_color="FFCCCC", end_color="FFCCCC", fill_type="solid")
        conv_diff_fill = PatternFill(start_color="FFE699", end_color="FFE699", fill_type="solid") # Orange/Yellow
        data_font = Font(name="Calibri", size=10)
        num_fmt = "#,##0.00"

        # Títulos
        for col_idx, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col_idx, value=header)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = header_align
            cell.border = thin_border

        # Datos
        for row_idx, record in enumerate(req.data, 2):
            values = [
                record.nombre, record.id_empleado, record.empresa,
                record.devengos_xrp, record.deducciones_xrp, record.liquido_xrp,
                record.devengos_meta4, record.deducciones_meta4, record.liquido_meta4,
                record.diferencia,
                record.convenio_xrp, record.convenio_meta4
            ]
            has_diff = abs(record.diferencia) > 0.01
            conv_mismatch = record.convenio_match == "NO COINCIDE"

            for col_idx, value in enumerate(values, 1):
                cell = ws.cell(row=row_idx, column=col_idx, value=value)
                cell.font = data_font
                cell.border = thin_border
                # Format numbers
                if isinstance(value, (int, float)) and col_idx >= 4:
                    cell.number_format = num_fmt
                    cell.alignment = Alignment(horizontal="right")
                
                # Format background if diff in totals
                if has_diff:
                    cell.fill = diff_fill
                
                # Format background specifically for Convenio columns if they mismatch
                if conv_mismatch and col_idx in (11, 12):
                    cell.fill = conv_diff_fill

        # Ajuste dinámico col_width
        for col_idx in range(1, len(headers) + 1):
            max_len = len(headers[col_idx - 1])
            for row_idx in range(2, len(req.data) + 2):
                val = ws.cell(row=row_idx, column=col_idx).value
                if val:
                    max_len = max(max_len, len(str(val)))
            ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = min(max_len + 4, 35)

        ws.freeze_panes = "A2"

        # Convertir a Buffer -> Base64
        buf = BytesIO()
        wb.save(buf)
        buf.seek(0)
        b64 = base64.b64encode(buf.read()).decode("utf-8")

        return JSONResponse(content={"excel_base64": b64})

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando Excel: {str(e)}")
