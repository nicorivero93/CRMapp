# Meta Cloud API — Setup para MyCRM Local Edition

Guía para activar el canal **Meta Cloud API** en MyCRM (envío automático + recepción de respuestas por webhook). Esta variante reemplaza al modo `manual` (wa.me) cuando el cliente quiere que las respuestas de WhatsApp se graben solas en el CRM sin que la vendedora tenga que marcar cada mensaje.

---

## Cuándo conviene activarlo

**Activalo si**:
- El cliente tiene WhatsApp Business API aprobado (o puede aprobarlo — es gratis pero toma 1-2 semanas).
- Tiene un número dedicado para Business API (no se puede usar el mismo que ya está en WhatsApp Web/celular).
- Quiere tracking automático de respuestas (sin tener que marcar "respondió" a mano).
- Puede exponer el server con una URL pública (tunnel o IP pública).

**No lo activés si**:
- El cliente manda < 200 mensajes por día — el modo manual alcanza y sale gratis.
- No quieren lidiar con aprobación Meta Business.
- El server vive 100% en LAN cerrada sin salida a internet.

---

## Costos (Argentina, 2026)

| Tipo de conversación | Precio por conv |
|---|---|
| **Marketing** (vos iniciás con template, mensajes promo) | ~$0.05 USD |
| **Utility** (vos iniciás, notifs tipo "su pedido está listo") | ~$0.015 USD |
| **Authentication** (OTPs) | ~$0.035 USD |
| **Service** (el lead te escribe primero, ventana 24h) | **gratis** |

Una "conversación" = ventana de 24h después del primer mensaje.
Datos actualizados: [Meta WhatsApp Pricing](https://developers.facebook.com/docs/whatsapp/pricing).

Para el caso del cliente mayorista del brief: mayormente **service** (el lead viene de IG/FB/TikTok y escribe primero) → gratis. Si le mandás un template de primer contacto → marketing → ~$0.05.

---

## Paso a paso

### 1. Alta en Meta Business

1. Ir a [business.facebook.com](https://business.facebook.com) y crear un **WhatsApp Business Account** (WABA).
2. Agregar un número de teléfono nuevo (no puede ser uno ya usado en la app WhatsApp regular). Meta manda un SMS/llamada para verificar.
3. Agregar método de pago (tarjeta). No se cobra nada hasta el primer envío facturable.

### 2. Crear una app Meta for Developers

1. [developers.facebook.com/apps](https://developers.facebook.com/apps) → Create App → tipo **Business**.
2. Asociá la app a tu WABA.
3. En el sidebar, agregá el producto **WhatsApp**.
4. En la sección WhatsApp, anotá:
   - **phone_number_id** (ID del número de teléfono WA Business)
   - **WhatsApp Business Account ID** (el businessId)

### 3. Access Token

Meta ofrece un token temporal (24h) para probar, y uno permanente (system user) para prod.

**Para producción** (recomendado):
1. En Meta Business → Configuración → Usuarios → Usuarios del sistema → Crear.
2. Asignale la app de WhatsApp con permisos `whatsapp_business_messaging` y `whatsapp_business_management`.
3. Generá un token **sin expiración**.
4. Copiá ese token → lo pegás en MyCRM (`accessToken`).

### 4. Exponer el server a internet (webhook)

Meta necesita poder hacer POST a `/api/whatsapp/webhook` cuando llegan mensajes. Si tu server vive en LAN:

**Opción A — Cloudflare Tunnel** (recomendado, gratis para siempre):

```bash
# En la PC del server:
winget install --id Cloudflare.cloudflared
cloudflared tunnel login
cloudflared tunnel create mycrm
cloudflared tunnel route dns mycrm mycrm.tudominio.com
cloudflared tunnel run mycrm --url http://localhost:3180
```

Resultado: `https://mycrm.tudominio.com/api/whatsapp/webhook` queda público y redirige al :3180 local. Requiere que el cliente tenga (o compre por $10/año) un dominio propio.

**Opción B — ngrok** (fácil para probar, link cambia cada reinicio en free):

```bash
ngrok http 3180
# → https://xxxx.ngrok-free.app
```

**Opción C — Tailscale Funnel** (similar a Cloudflare pero sin dominio propio).

### 5. Configurar el webhook en Meta

1. En Meta → app → WhatsApp → Configuration → Webhooks → Edit.
2. **Callback URL**: la URL pública + `/api/whatsapp/webhook`
   (ej. `https://mycrm.tudominio.com/api/whatsapp/webhook`).
3. **Verify token**: inventá una string secreta (ej. `mycrm-verify-xyz123`).
4. Subscribí los campos: `messages`.
5. Meta va a hacer un GET a tu URL con `hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`.
   MyCRM compara el token contra lo que cargaste y devuelve el challenge.
6. Si todo OK, Meta habilita las notificaciones.

### 6. Cargar credenciales en MyCRM

1. En MyCRM, entrá como owner → Configuración → **WhatsApp**.
2. En "Credenciales Meta Business" cargá:
   - `phoneNumberId` (paso 2)
   - `businessId` (paso 2)
   - `accessToken` (paso 3)
   - `webhookVerifyToken` (paso 5, el mismo valor que pusiste en Meta)
3. Guardar. MyCRM los encripta con AES-256-GCM antes de persistir.

### 7. Activar el canal

1. En la misma pantalla, arriba, seleccioná **"Meta Cloud API"**.
2. El CRM chequea que la config esté completa antes de activar.
3. Desde ahora, los clicks en "WhatsApp" del LeadDetail envían vía API oficial (queda registrado `message-sent` con `providerMessageId`).

### 8. Probar envío

Abajo de la pantalla aparece un panel "Probar envío". Mandate un mensaje a tu propio celular (el mismo que usaste para registrar la app Meta — así caés dentro de la ventana de 24h aunque no haya templates aprobados todavía).

### 9. Probar recepción

1. Contestá el mensaje de prueba desde el celular.
2. Meta manda POST a tu webhook.
3. En MyCRM debería aparecer un evento `response-received` en el lead (si existía con ese teléfono) y el status pasa a `responded`.

---

## Templates

Fuera de la ventana de 24h, Meta solo permite mensajes con **templates pre-aprobados** (HSM). MyCRM en L2.8 envía todo como `type: 'text'` — funciona dentro de ventana pero falla fuera. Roadmap para agregar template API:

1. Crear templates en Meta Business → WhatsApp → Message Templates.
2. Esperar aprobación (minutos a días).
3. Extender `MetaCloudChannel.send` para aceptar `templateName` + params.
4. Permitir que los templates en `/app/settings/templates` se linkeen a un template Meta aprobado.

---

## Troubleshooting

**"Webhook callback verification failed"**:
- El `verify_token` que cargaste en MyCRM debe ser **exactamente igual** al que escribiste en Meta. Copy-paste sin espacios.
- El server debe estar corriendo con `channel = 'meta-cloud'` o al menos con el verify token guardado.

**"Mensaje enviado pero no llegó"**:
- Si es a un número fuera de la ventana de 24h, Meta acepta el request pero no entrega. Usá templates.
- El número destino tiene que tener WhatsApp instalado y activo.

**"401 Unauthorized" al enviar**:
- El access token expiró (los temporales duran 24h). Generá uno permanente (paso 3).

**"Aparecen mensajes en el webhook pero no matchean lead"**:
- El lead tiene que existir en la DB con `phoneNormalized` = el wa_id que manda Meta (formato `+549...`).
- Revisá en `/app/leads` que el lead existe y tiene el teléfono correcto.

**"No veo respuestas en el timeline"**:
- Chequeá logs del server (`C:\ProgramData\MyCRM\logs\`).
- Verificá que Meta está llegando al webhook: en `Meta → WhatsApp → Configuration → Webhooks`, mirá "Recent Deliveries".

---

## Seguridad

- `accessToken` y `webhookVerifyToken` viven encriptados en `appSettings` con AES-256-GCM. La key deriva de `COOKIE_SECRET` (env var del service) vía scrypt. Nadie sin acceso al proceso puede descifrarlos leyendo solo la DB.
- Si rotás `COOKIE_SECRET`, las secrets almacenadas dejan de descifrarse — hay que cargarlas de vuelta. Esto es intencional (defense in depth).
- El webhook no valida firma HMAC de Meta todavía — queda como TODO L2.8+. Por ahora confiá en que solo Meta conoce la URL + el challenge inicial.
