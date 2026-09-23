import argparse, hashlib, json, re, subprocess
from pathlib import Path
p=argparse.ArgumentParser()
for name in ['aapt','apksigner','apk','previous','report']: p.add_argument('--'+name,required=True)
p.add_argument('--expected-code',type=int,required=True)
a=p.parse_args()
config=json.loads((Path(__file__).resolve().parents[1]/'mobile/android-release.json').read_text())
def inspect(file):
    manifest=subprocess.check_output([a.aapt,'dump','badging',str(file)],text=True)
    match=re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'",manifest)
    if not match: raise RuntimeError('Missing package metadata')
    signature=subprocess.check_output([a.apksigner,'verify','--verbose','--print-certs',str(file)],text=True)
    cert=re.search(r'Signer #1 certificate SHA-256 digest: ([0-9a-f]+)',signature)
    if not cert: raise RuntimeError('Missing verified certificate')
    return dict(package=match[1],versionCode=int(match[2]),versionName=match[3],certificateSha256=cert[1],sha256=hashlib.sha256(Path(file).read_bytes()).hexdigest())
new=inspect(a.apk)
assert new['package']==config['applicationId'],new
assert new['versionCode']==a.expected_code,new
assert new['certificateSha256']==config['certificateSha256'],new
assert new['versionName']==config['versionName']+'.'+str(a.expected_code-config['versionCode']),new
old=inspect(a.previous)
assert new['package']==old['package'],'Package differs from the previous published APK'
assert new['versionCode']>old['versionCode'],'versionCode must increase over the published APK'
report={'artifact':new,'previousPublishedArtifact':old,'sameSigningCertificate':new['certificateSha256']==old['certificateSha256']}
if not report['sameSigningCertificate']:
    print('NOTICE: One-time migration from the previous signing key is required; this is NOT an in-place update for that APK.')
Path(a.report).write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
