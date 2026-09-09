# Manifests de winget

Fuente de verdad de los manifests que se copian al fork de `microsoft/winget-pkgs`.
Una carpeta por version, con los tres archivos que pide el esquema.

Antes de abrir el PR externo, comprobar por ejecucion y no por lectura:

```bash
# 1) validez de esquema (1.10.0)
for s in version installer defaultLocale; do
  curl -sSLo /tmp/winget-$s.json "https://aka.ms/winget-manifest.$s.1.10.0.schema.json"
done
python3 - <<'PY'
import json, yaml, glob
from jsonschema import Draft7Validator
mapa = {'installer': 'installer', 'locale.en-US': 'defaultLocale'}
for f in sorted(glob.glob('packaging/winget/*/*/*.yaml')):
    clave = next((v for k, v in mapa.items() if f.endswith(k + '.yaml')), 'version')
    doc = yaml.safe_load(open(f, encoding='utf-8'))
    sch = json.load(open(f'/tmp/winget-{clave}.json', encoding='utf-8'))
    errs = list(Draft7Validator(sch).iter_errors(doc))
    print(f.split('/')[-1], 'valido' if not errs else errs[0].message)
PY

# 2) que los SHA256 sean los de los bytes publicados, no los de SHA256SUMS.txt
python3 - <<'PY'
import yaml, hashlib, urllib.request
d = yaml.safe_load(open('packaging/winget/DLSLabs.Daylo/1.1.1/DLSLabs.Daylo.installer.yaml'))
for i in d['Installers']:
    b = urllib.request.urlopen(i['InstallerUrl']).read()
    real = hashlib.sha256(b).hexdigest().upper()
    print(i['Architecture'], 'coincide' if real == i['InstallerSha256'] else f"NO COINCIDE {real}")
PY
```

`ReleaseDate` va entre comillas: sin ellas, YAML lo convierte a fecha y el esquema pide cadena.

`Scope: user` porque el NSIS se genera con `installMode: currentUser` en `tauri.conf.json`.
Si eso cambia, cambia el `Scope`.
