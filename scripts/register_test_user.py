import urllib.request, json, sys

url = 'https://podcast-api-524304361363.us-west1.run.app/api/auth/register'
data = {'email': 'test@scottgerhardt.com', 'password': 'Test1234'}
req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read().decode('utf-8')
        print('STATUS', resp.status)
        print(body)
except urllib.error.HTTPError as e:
    print('HTTPERR', e.code)
    try:
        print(e.read().decode())
    except Exception:
        pass
    sys.exit(1)
except Exception as e:
    print('ERR', e)
    sys.exit(2)
