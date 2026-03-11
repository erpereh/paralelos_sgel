import os
import glob
search_dirs = [
    r'c:\Users\Perez\Documents\aQuality SolutIon\proyectos git\paralelos_sgel',
    r'C:\Users\Perez\Downloads',
    r'C:\Users\Perez\Desktop'
]
files = []
for d in search_dirs:
    for root, _, filenames in os.walk(d):
        for f in filenames:
            if f.endswith('.xlsx'):
                files.append(os.path.join(root, f))

files.sort(key=os.path.getmtime, reverse=True)
for f in files[:10]:
    print(f, os.path.getmtime(f))
