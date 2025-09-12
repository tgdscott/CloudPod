import os


def test_health_deep_ok(client, monkeypatch):
    # Ensure broker passes
    monkeypatch.delenv('HEALTH_FORCE_BROKER_FAIL', raising=False)
    res = client.get('/api/health/deep')
    assert res.status_code == 200
    data = res.json()
    assert data == { 'db': 'ok', 'storage': 'ok', 'broker': 'ok' }


def test_health_deep_broker_fail(client, monkeypatch):
    monkeypatch.setenv('HEALTH_FORCE_BROKER_FAIL', '1')
    res = client.get('/api/health/deep')
    assert res.status_code == 503
    data = res.json()
    assert data['db'] == 'ok'
    assert data['storage'] == 'ok'
    assert data['broker'] == 'fail'


def test_health_deep_storage_fail(client, monkeypatch):
    # Monkeypatch os.path.isdir or os.access to simulate storage failure
    import api.routers.health as health_mod

    def fake_isdir(path):
        return False
    def fake_access(path, mode):
        return False

    monkeypatch.setattr(health_mod.os.path, 'isdir', staticmethod(fake_isdir))
    monkeypatch.setattr(health_mod.os, 'access', staticmethod(fake_access))

    # Ensure broker ok
    monkeypatch.delenv('HEALTH_FORCE_BROKER_FAIL', raising=False)

    res = client.get('/api/health/deep')
    assert res.status_code == 503
    data = res.json()
    assert data['db'] == 'ok'
    assert data['storage'] == 'fail'
    assert data['broker'] == 'ok'
