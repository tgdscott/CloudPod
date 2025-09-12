import logging
from importlib import import_module

# Import via package path so relative imports inside the module resolve
logging_mod = import_module('api.core.logging')
configure_logging = logging_mod.configure_logging  # type: ignore
get_logger = logging_mod.get_logger  # type: ignore


def test_logging_redaction(caplog):
    configure_logging()
    logger = get_logger('test.redaction')
    secret_email = 'user@example.com'
    token = 'Bearer abcdef1234567890TOKENSTRING'
    api_key = 'sk_1234567890abcdefABCDEF'

    with caplog.at_level(logging.INFO):
        logger.info('Testing email=%s token=%s key=%s', secret_email, token, api_key)

    joined = '\n'.join(caplog.messages)
    # Ensure raw secrets are not present
    assert secret_email not in joined
    assert token not in joined
    assert api_key not in joined

    # Ensure redaction markers appear
    assert '<redacted-email>' in joined
    assert '<redacted-secret>' in joined

    # Basic sanity: no accidental empty string logging
    assert joined.strip() != ''
