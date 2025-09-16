import requests, sys
API='https://podcast-api-524304361363.us-west1.run.app'
email='test@scottgerhardt.com'
password='Test1234'
try:
    r = requests.post(f'{API}/api/auth/token', data={'username': email, 'password': password})
    print('token status', r.status_code)
    print(r.json())
    token = r.json().get('access_token')
    if not token:
        sys.exit(1)
    h={'Authorization': f'Bearer {token}'}
    me = requests.get(f'{API}/api/users/me', headers=h)
    print('me status', me.status_code)
    print(me.json())
except Exception as e:
    print('ERROR', e)
    sys.exit(1)
