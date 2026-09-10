# winget manifests

Source of truth for the manifests that are copied to the `microsoft/winget-pkgs` fork.
One folder per version, with the three files the schema requires.

Before opening the external PR, check by running, not by reading. The two blocks are run
**from the repo root** and need `pyyaml` and `jsonschema`
(`python3 -m pip install pyyaml jsonschema` if they are not installed):

```bash
# 1) schema validity (1.12.0)
for s in version installer defaultLocale; do
  curl -sSLo /tmp/winget-$s.json "https://aka.ms/winget-manifest.$s.1.12.0.schema.json"
done
python3 - <<'PY'
import json, yaml, glob
from jsonschema import Draft7Validator
schema_for = {'installer': 'installer', 'locale.en-US': 'defaultLocale'}
for f in sorted(glob.glob('packaging/winget/*/*/*.yaml')):
    schema = next((v for k, v in schema_for.items() if f.endswith(k + '.yaml')), 'version')
    doc = yaml.safe_load(open(f, encoding='utf-8'))
    sch = json.load(open(f'/tmp/winget-{schema}.json', encoding='utf-8'))
    errs = list(Draft7Validator(sch).iter_errors(doc))
    print(f.split('/')[-1], 'valid' if not errs else errs[0].message)
PY

# 2) the SHA256 values must be those of the published bytes, not the ones in SHA256SUMS.txt
python3 - <<'PY'
import yaml, hashlib, urllib.request, glob
for f in sorted(glob.glob('packaging/winget/*/*/*.installer.yaml')):
    d = yaml.safe_load(open(f, encoding='utf-8'))
    for i in d['Installers']:
        b = urllib.request.urlopen(i['InstallerUrl']).read()
        real = hashlib.sha256(b).hexdigest().upper()
        print(d['PackageVersion'], i['Architecture'], 'matches' if real == i['InstallerSha256'] else f"MISMATCH {real}")
PY
```

`ReleaseDate` goes in quotes: without them, YAML converts it to a date and the schema requires a string.

`Scope: user` because the NSIS is generated with `installMode: currentUser` in `tauri.conf.json`.
If that changes, the `Scope` changes too.
