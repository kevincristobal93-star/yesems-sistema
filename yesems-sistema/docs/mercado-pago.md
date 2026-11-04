# Mercado Pago Checkout Pro

The Portal docente payment page now supports Mercado Pago Checkout Pro. The backend creates a preference from the authenticated user's enrollment and the remaining balance stored in PostgreSQL. The browser return URL is informational only: enrollment is confirmed only after a signed webhook is verified and the backend retrieves the payment directly from Mercado Pago.

## Required private environment variables

Set these in the Render **backend web service** environment, not in frontend code, Git, or chat:

| Variable | Value |
| --- | --- |
| `MERCADOPAGO_ACCESS_TOKEN` | Access Token from the Mercado Pago application. Use a test token only in an isolated staging environment; use the production token only after testing. |
| `MERCADOPAGO_WEBHOOK_SECRET` | Secret generated for the application's Webhooks configuration. |
| `MERCADOPAGO_WEBHOOK_URL` | `https://yesems-sistema-1.onrender.com/api/pagos/mercado-pago/webhook` |
| `MERCADOPAGO_FRONTEND_URL` | `https://yesems-web.onrender.com` |

Until all four variables are valid, the API safely returns “pago en línea aún no está habilitado.” Restart/redeploy the backend after saving them.

## Mercado Pago application setup

1. In Mercado Pago Developers, open the application belonging to YES EMS and copy its Access Token into Render as a private environment variable. Never use the Public Key as the server token.
2. Open **Webhooks** for that application, set the production notification URL above, and subscribe to payment notifications (`payment`). Save the generated secret in Render as `MERCADOPAGO_WEBHOOK_SECRET`.
3. For a safe end-to-end test, first create an isolated staging backend with a separate test database and the application's test credentials. Use Mercado Pago test buyer credentials/cards; do not put test credentials on the production backend or use real buyer data in a test transaction.
4. After validating approved, rejected, pending, and retry scenarios in staging, set the production Access Token and production webhook secret on the production backend. Then make a low-value real transaction and verify the payment appears in the admin panel and the enrollment only activates after approval.

The code stores preference/payment IDs and provider status for reconciliation. Do not approve a Mercado Pago payment manually in the admin UI; payments are verified from the provider notification. Any amount mismatch or excess payment remains pending for manual investigation.
