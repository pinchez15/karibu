-- pgTAP: AI clinical assist migration smoke tests
BEGIN;
SELECT plan(4);

SELECT has_function('public', 'rpc_request_lab_ai_assist', ARRAY['uuid']::text[]);
SELECT has_function('public', 'rpc_get_cme_modules');
SELECT has_function('public', 'rpc_start_consult', ARRAY['uuid', 'jsonb']::text[]);
SELECT has_column('public', 'ai_review_suggestions', 'display_tier');

SELECT * FROM finish();
ROLLBACK;
