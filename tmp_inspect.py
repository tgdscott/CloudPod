from importlib import import_module
try:
    import_module('celery')
    print('celery ok')
except Exception as e:
    print('celery error', e)

