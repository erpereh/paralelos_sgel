import pandas as pd
import glob
print("---")
for f in glob.glob('C:\\Users\\Perez\\Downloads\\n8n quality\\*.xlsx'):
    try:
        df = pd.read_excel(f)
        print(f"File: {f}")
        print("Columns:", df.columns.tolist())
    except Exception as e:
        pass
    print("---")
