"""
Genera el PDF instructivo de Automatizaciones del CRM.

Uso: python scripts/generate-automations-guide.py
Output: apps/web/public/docs/instructivo-automatizaciones.pdf

Regenerar cada vez que cambian triggers/acciones del engine.
"""
from pathlib import Path
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    PageBreak,
    Table,
    TableStyle,
    KeepTogether,
)

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "apps" / "web" / "public" / "docs" / "instructivo-automatizaciones.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)

BRAND = colors.HexColor("#8b5cf6")
INK = colors.HexColor("#0f172a")
DIM = colors.HexColor("#475569")
FAINT = colors.HexColor("#94a3b8")
SOFT = colors.HexColor("#f1f5f9")
LINE = colors.HexColor("#e2e8f0")

styles = getSampleStyleSheet()

H1 = ParagraphStyle("H1", parent=styles["Heading1"], fontName="Helvetica-Bold",
                   fontSize=22, leading=26, textColor=INK, spaceAfter=8)
H2 = ParagraphStyle("H2", parent=styles["Heading2"], fontName="Helvetica-Bold",
                   fontSize=15, leading=19, textColor=INK, spaceBefore=14, spaceAfter=6)
H3 = ParagraphStyle("H3", parent=styles["Heading3"], fontName="Helvetica-Bold",
                   fontSize=11.5, leading=15, textColor=BRAND, spaceBefore=10, spaceAfter=4)
BODY = ParagraphStyle("Body", parent=styles["BodyText"], fontName="Helvetica",
                     fontSize=10.5, leading=15, textColor=INK, spaceAfter=6, alignment=TA_LEFT)
BULLET = ParagraphStyle("Bullet", parent=BODY, leftIndent=14, bulletIndent=2)
DIMTXT = ParagraphStyle("Dim", parent=BODY, textColor=DIM, fontSize=10, leading=14)
CODE = ParagraphStyle("Code", parent=BODY, fontName="Courier",
                     fontSize=9.5, leading=13, textColor=INK, leftIndent=8,
                     backColor=SOFT, borderPadding=6, spaceAfter=6)
NOTE = ParagraphStyle("Note", parent=BODY, fontSize=10, leading=14, textColor=DIM,
                     leftIndent=10, backColor=colors.HexColor("#fef3c7"),
                     borderPadding=8, spaceBefore=4, spaceAfter=8)
COVERTITLE = ParagraphStyle("CoverTitle", parent=H1, fontSize=34, leading=40,
                            alignment=TA_CENTER, spaceAfter=14)
COVERSUB = ParagraphStyle("CoverSub", parent=BODY, fontSize=14, leading=20,
                          alignment=TA_CENTER, textColor=DIM, spaceAfter=6)


def on_page(canvas, doc):
    canvas.saveState()
    w, h = A4
    # footer
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(2 * cm, 1.6 * cm, w - 2 * cm, 1.6 * cm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(FAINT)
    year = datetime.now().year
    canvas.drawString(2 * cm, 1.1 * cm, f"© {year} · tomerivero.dev")
    canvas.drawRightString(w - 2 * cm, 1.1 * cm, f"Página {doc.page}")
    canvas.drawCentredString(w / 2, 1.1 * cm, "Instructivo · Automatizaciones MyCRM")
    canvas.restoreState()


def on_cover(canvas, doc):
    canvas.saveState()
    w, h = A4
    # top accent
    canvas.setFillColor(BRAND)
    canvas.rect(0, h - 0.6 * cm, w, 0.6 * cm, stroke=0, fill=1)
    canvas.setFillColor(FAINT)
    canvas.setFont("Helvetica", 9)
    canvas.drawCentredString(w / 2, 1.2 * cm, "tomerivero.dev · MyCRM")
    canvas.restoreState()


def p(text, style=BODY):
    return Paragraph(text, style)


def bullets(items, style=BULLET):
    return [Paragraph(f"• {t}", style) for t in items]


def kv_table(rows, col_widths=(5 * cm, 11 * cm)):
    t = Table(rows, colWidths=col_widths, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SOFT),
        ("TEXTCOLOR", (0, 0), (-1, 0), INK),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def example_box(titulo, si, y, entonces):
    data = [
        [Paragraph(f"<b>{titulo}</b>", BODY)],
        [Paragraph(f"<b>SI</b> — {si}", BODY)],
        [Paragraph(f"<b>Y</b> — {y}", BODY)],
        [Paragraph(f"<b>ENTONCES</b> — {entonces}", BODY)],
    ]
    t = Table(data, colWidths=[16 * cm], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 1), (-1, -1), SOFT),
        ("BOX", (0, 0), (-1, -1), 0.4, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return KeepTogether([t, Spacer(1, 10)])


story = []

# ---------- COVER ----------
story += [
    Spacer(1, 6 * cm),
    Paragraph("Automatizaciones", COVERTITLE),
    Paragraph("Guía práctica para el usuario del CRM", COVERSUB),
    Spacer(1, 1 * cm),
    Paragraph(
        'Cómo armar reglas del tipo <b>SI</b> → <b>Y</b> → <b>ENTONCES</b> '
        "para que el CRM te ahorre tareas repetitivas.",
        ParagraphStyle("CoverBody", parent=BODY, fontSize=12, leading=18,
                      alignment=TA_CENTER, textColor=DIM),
    ),
    Spacer(1, 3 * cm),
    Paragraph(f"Versión del {datetime.now().strftime('%B %Y')}",
              ParagraphStyle("V", parent=BODY, alignment=TA_CENTER,
                             textColor=FAINT, fontSize=10)),
    PageBreak(),
]

# ---------- 1. QUÉ ES ----------
story += [
    p("Qué es una automatización", H1),
    p(
        "Una automatización es una regla que el CRM ejecuta sola cuando pasa "
        "algo adentro del sistema. No hay que estar encima: si se cumple la "
        "condición que armaste, las acciones corren solas.",
    ),
    p("Toda regla tiene tres partes:", BODY),
    Spacer(1, 4),
]

structure = [
    ["SI", "El disparador. Un evento dentro del CRM (ej: 'se creó un lead nuevo')."],
    ["Y", "Las condiciones. Filtros opcionales para no disparar siempre (ej: 'solo si la fuente es Instagram')."],
    ["ENTONCES", "Las acciones. Lo que el CRM hace cuando todo lo de arriba se cumple (ej: 'asignale el lead a Juan y ponele el tag hot')."],
]
story += [kv_table([["Parte", "Qué es"]] + structure, col_widths=(2.5 * cm, 13.5 * cm)), Spacer(1, 10)]

story += [
    p(
        "Podés armar todas las reglas que quieras. Cada una se activa o se pausa "
        "con un click. Si querés probar una antes de dejarla corriendo, tenés el "
        "botón <b>Probar</b> en el editor — te muestra si hubiera matcheado con "
        "un evento real, sin ejecutar nada.",
    ),
    PageBreak(),
]

# ---------- 2. TRIGGERS ----------
story += [p("Los 4 triggers que podés usar", H1)]

triggers = [
    ("Nuevo lead", "lead.created",
     "Cada vez que entra un lead nuevo al CRM (formulario, importación, o carga manual).",
     "Podés filtrar por <b>fuente</b>: Instagram, Facebook, Web, Referral, TikTok, Google, etc. Si no elegís fuente, dispara con cualquiera."),
    ("Lead cambia de estado", "lead.status-changed",
     "Cada vez que un lead pasa de un estado a otro.",
     "Podés filtrar por estado de origen y destino. Ej: <b>de</b> 'contacted' <b>a</b> 'qualified'. Estados disponibles: new, assigned, contacted, responded, qualified, converted, no-response, recycled, discarded."),
    ("Deal cambia de etapa", "deal.stage-changed",
     "Cuando arrastrás un deal de una columna a otra en el Pipeline.",
     "Podés filtrar por etapa de origen y destino usando el ID de la etapa. Los IDs los ves en Configuración → Etapas del pipeline."),
    ("Nuevo contacto", "contact.created",
     "Cada vez que se crea un contacto.",
     "Sin filtros adicionales — dispara siempre que se crea uno."),
]
for nom, iid, cuando, filtro in triggers:
    story += [
        p(f"{nom} <font color='#94a3b8'>({iid})</font>", H3),
        p(f"<b>Cuándo dispara:</b> {cuando}"),
        p(f"<b>Filtros:</b> {filtro}"),
    ]

story += [PageBreak()]

# ---------- 3. ACCIONES ----------
story += [p("Las 5 acciones disponibles", H1)]

acciones = [
    ("Agregar tag", "add-tag",
     "Suma un tag (etiqueta) al lead o contacto que disparó la regla.",
     "<b>tag</b>: texto corto (ej: 'hot', 'vip', 'instagram-feb'). Si el tag ya existe en el lead, no se duplica."),
    ("Asignar vendedor", "assign-owner",
     "Asigna el lead a un vendedor del equipo.",
     "<b>userId</b>: el ID del usuario. Lo sacás de Configuración → Usuarios (o pedí que te lo pasen los admins)."),
    ("Mover deal a etapa", "move-stage",
     "Mueve el deal disparador a otra columna del pipeline.",
     "<b>stageId</b>: el ID de la etapa destino. Lo ves en Configuración → Etapas del pipeline."),
    ("Dejar nota interna", "notify-user",
     "Agrega una nota en el timeline del lead (la ve todo el equipo).",
     "<b>userId</b> (opcional): a quién está dirigida. <b>message</b>: el texto de la nota (hasta 500 caracteres).<br/><br/>"
     "<font color='#b45309'><b>Importante:</b> esta acción NO manda email ni WhatsApp ni notificación push. Es una nota interna del CRM, que queda en el historial del lead.</font>"),
    ("Actualizar campo", "update-field",
     "Cambia un campo del lead disparador.",
     "<b>field</b>: solamente uno de estos tres — <i>name</i>, <i>notes</i>, <i>status</i>. No se pueden tocar otros campos (email, teléfono, fuente, etc.) desde una regla.<br/>"
     "<b>value</b>: el nuevo valor (hasta 2000 caracteres)."),
]
for nom, iid, que, params in acciones:
    story += [
        p(f"{nom} <font color='#94a3b8'>({iid})</font>", H3),
        p(f"<b>Qué hace:</b> {que}"),
        p(f"<b>Parámetros:</b> {params}"),
    ]

story += [PageBreak()]

# ---------- 4. CONDICIONES ----------
story += [
    p("Cómo armar condiciones", H1),
    p(
        "Las condiciones son filtros que se suman al trigger. Todas se "
        "combinan con <b>Y</b> (AND): para que la regla dispare, <b>todas</b> "
        "tienen que cumplirse. No existe la opción OR."),
    p("Una condición tiene 3 partes:", BODY),
]
story += bullets([
    "<b>Campo</b> del lead/contacto/deal que querés inspeccionar (ej: <i>source</i>, <i>value</i>, <i>status</i>).",
    "<b>Operador</b> (ver tabla abajo).",
    "<b>Valor</b> contra el que comparás.",
])
story += [Spacer(1, 6)]

ops = [
    ["eq", "Igual a", "status eq 'qualified'"],
    ["neq", "Distinto de", "source neq 'web'"],
    ["contains", "Contiene texto (case-insensitive) o elemento en lista", "notes contains 'urgente'"],
    ["not-contains", "NO contiene", "tags not-contains 'frío'"],
    ["gt / gte", "Mayor / Mayor o igual", "value gte 50000"],
    ["lt / lte", "Menor / Menor o igual", "responseCount lt 3"],
    ["in", "Está en una lista (separada por comas)", "source in 'instagram,facebook'"],
    ["exists", "El campo existe y tiene valor", "email exists (true)"],
]
t = Table(
    [["Operador", "Qué hace", "Ejemplo"]] + ops,
    colWidths=(3.2 * cm, 6.5 * cm, 6.3 * cm),
    hAlign="LEFT",
)
t.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), BRAND),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
    ("FONTNAME", (2, 1), (2, -1), "Courier"),
    ("FONTSIZE", (0, 0), (-1, -1), 9.5),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SOFT]),
    ("GRID", (0, 0), (-1, -1), 0.3, LINE),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
]))
story += [t, Spacer(1, 10)]

story += [
    p(
        "<b>Tip:</b> si escribís un nombre de campo que no existe en el lead, "
        "la condición simplemente no matchea — la regla no dispara pero tampoco "
        "da error. Revisá bien la ortografía del campo.",
        NOTE,
    ),
    PageBreak(),
]

# ---------- 5. PASO A PASO ----------
story += [
    p("Paso a paso: crear tu primera automatización", H1),
    p("Desde el menú lateral entrás a <b>Automatizaciones</b>. Tocás <b>Nueva</b>."),
]

pasos = [
    ("1. Ponele un nombre",
     "Algo descriptivo que vos entiendas después. Ej: <i>'Lead IG hot → asignar Juan'</i>. Hasta 120 caracteres."),
    ("2. Dejala activa (o pausada)",
     "El checkbox <b>Activa</b> controla si la regla corre. Podés guardarla pausada y activarla después."),
    ("3. Elegí el SI (trigger)",
     "Desplegás el select y elegís uno de los 4 eventos. Si elegiste uno que tiene filtros "
     "(lead creado, cambio de estado, cambio de etapa), completás esos campos."),
    ("4. Sumá condiciones (opcional)",
     "Tocás <b>+ Agregar condición</b>. Llenás campo, operador, y valor. Podés sumar hasta 10. "
     "Si no querés filtros, dejalo vacío — la regla dispara siempre que matchee el trigger."),
    ("5. Sumá acciones (obligatorio, al menos una)",
     "Tocás <b>+ Agregar acción</b>. Elegís el tipo y llenás los parámetros. Podés sumar hasta 10: se ejecutan en orden, una tras otra."),
    ("6. Probala antes de guardar",
     "Botón <b>Probar</b>: simula un disparo con data de ejemplo y te muestra si la regla hubiera matcheado y qué acciones correrían. No ejecuta nada real."),
    ("7. Guardar",
     "Botón <b>Crear / Guardar</b>. Desde ese momento, cada vez que pase el evento la regla corre."),
]
for titulo, desc in pasos:
    story += [p(titulo, H3), p(desc)]

story += [Spacer(1, 8), p(
    "En la lista de reglas vas a ver: nombre, qué trigger tiene, cuántas condiciones "
    "y acciones, cuándo fue el último disparo y cuántas veces se ejecutó. Desde ahí "
    "podés <b>pausar/reactivar</b>, <b>editar</b> o <b>borrar</b>.",
), PageBreak()]

# ---------- 6. EJEMPLOS ----------
story += [
    p("5 ejemplos listos para copiar", H1),
    p("Todos probados con el engine del CRM. Ajustá los IDs a tu equipo."),
    Spacer(1, 6),
]

story += [
    example_box(
        "1. Lead caliente de Instagram → asignar y etiquetar",
        "Nuevo lead, fuente = Instagram",
        "value (monto estimado) mayor o igual a 50.000",
        "Asignar a Juan (userId) + agregar tag <i>hot</i> + dejar nota <i>'Lead hot de IG, monto alto, llamar hoy'</i>",
    ),
    example_box(
        "2. Deal que llega a Cierre → marcarlo y avisar",
        "Deal cambia de etapa, destino = Cierre (stageId)",
        "(sin condiciones extra)",
        "Agregar tag <i>closing</i> + dejar nota <i>'Coordinar firma de contrato y envío de factura'</i>",
    ),
    example_box(
        "3. Lead sin respuesta reiterada → reciclar",
        "Lead cambia de estado, destino = no-response",
        "responseCount mayor o igual a 3",
        "Actualizar campo <i>status</i> a <i>recycled</i> (vuelve al pool para reasignar)",
    ),
    example_box(
        "4. Referral VIP → al dueño directo",
        "Nuevo lead, fuente = Referral",
        "(sin condiciones)",
        "Asignar al dueño/owner del equipo + agregar tag <i>vip-referral</i>",
    ),
    example_box(
        "5. Contacto nuevo → tarea para el equipo",
        "Nuevo contacto",
        "(sin condiciones)",
        "Dejar nota <i>'Revisar contacto nuevo y asignar vendedor'</i>",
    ),
]

story += [PageBreak()]

# ---------- 7. LIMITACIONES ----------
story += [
    p("Lo que las automatizaciones todavía NO hacen", H1),
    p(
        "Lo decimos al toque para que no pierdas tiempo buscándolo. Estas "
        "limitaciones son reales de esta versión — si necesitás alguna, "
        "escribinos y la evaluamos.",
    ),
]
story += bullets([
    "<b>No mandan email, WhatsApp, SMS ni notificaciones push desde la regla.</b> La acción <i>Dejar nota interna</i> solo escribe en el timeline del lead dentro del CRM.",
    "<b>No hay delays ni schedules.</b> Todas las acciones corren al toque cuando se dispara el trigger. No se puede armar 'ejecutá esto dentro de 24 horas' ni 'todos los lunes a las 9'.",
    "<b>No hay lógica OR.</b> Todas las condiciones se combinan con AND. Si querés OR, armás dos reglas separadas.",
    "<b>Si una acción falla (por ejemplo, userId o stageId inexistente) queda logueada y la regla sigue con la siguiente acción.</b> No hay reintento ni alerta al usuario — revisá los IDs bien antes de guardar.",
    "<b>Actualizar campo solo toca tres campos: name, notes, status.</b> No podés tocar email, teléfono, fuente, ni campos custom desde una regla.",
    "<b>No hay historial de ejecuciones detallado.</b> La lista muestra cuántas veces corrió y el último run, pero no un log de cada ejecución con su resultado.",
])

story += [
    Spacer(1, 14),
    p("Soporte y sugerencias", H2),
    p(
        "Si algo no funciona como esperabas o tenés una idea para mejorar "
        "las automatizaciones, escribinos a <font color='#8b5cf6'><u>tomerivero.dev</u></font>. "
        "Cada feedback nos sirve para priorizar la siguiente versión.",
    ),
]

doc = SimpleDocTemplate(
    str(OUT),
    pagesize=A4,
    leftMargin=2 * cm,
    rightMargin=2 * cm,
    topMargin=2 * cm,
    bottomMargin=2.2 * cm,
    title="Instructivo · Automatizaciones MyCRM",
    author="tomerivero.dev",
    subject="Guía de uso de Automatizaciones del CRM",
)

doc.build(
    story,
    onFirstPage=on_cover,
    onLaterPages=on_page,
)

size_kb = OUT.stat().st_size / 1024
print(f"OK -> {OUT}  ({size_kb:.1f} KB)")
