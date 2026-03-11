import pandas as pd

files_to_check = [
    r'c:\Users\Perez\Documents\aQuality SolutIon\proyectos git\paralelos_sgel\conceptos_meta4.xlsx',
    r'C:\Users\Perez\Downloads\n8n quality\conceptos_meta4.xlsx',
    r'C:\Users\Perez\Downloads\n8n quality\CONCEPTOS_SGEL.xlsx',
    r'C:\Users\Perez\Downloads\n8n quality\comparativa_nominas.xlsx',
    r'C:\Users\Perez\Downloads\conteptos_meta4.xlsx'
]

for f in files_to_check:
    print(f"\n📁 File: {f}")
    try:
        xls = pd.ExcelFile(f)
        for sheet in xls.sheet_names:
            df = pd.read_excel(f, sheet_name=sheet)
            cols = df.columns.tolist()
            if any('ignorar' in str(c).lower() or 'cegid' in str(c).lower() or 'meta4' in str(c).lower() for c in cols):
                print(f"  ✅ [MATCH in Header] Sheet: {sheet}")
                print(f"      Headers: {cols}")
            else:
                print(f"  ❌ Sheet: {sheet}")
                print(f"      Headers: {cols}")
    except Exception as e:
        print("  Error reading file:", e)
