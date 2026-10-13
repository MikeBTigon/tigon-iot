/**
 * Help articles for each main area of the app (one per page group), in all four app languages.
 * NOTE: the Spanish, French and Haitian Creole texts are machine-assisted — have native speakers review them.
 * Listed in the Help center after the core how-tos (see HELP_ARTICLES in ./articles.ts).
 */
import type { HelpArticle } from './articles';

export const AREA_ARTICLES: HelpArticle[] = [
  // ---------------------------------------------------------------- Sell more
  {
    id: 'today',
    area: 'sellMore',
    path: '/mp/today',
    keywords: 'today call list who to call new leads follow ups to-dos tasks claim speed',
    text: {
      en: {
        title: 'Today: who to call',
        summary: 'Your list for the day: new leads to answer, follow-ups, to-dos, opened quotes and appointments.',
        steps: [
          'Open Today first thing. New leads are at the top — answer them first; the faster you reply, the more you sell.',
          'Tap Call or Text right on a row. The lead is marked as contacted for you.',
          'A yellow Claim button means a new lead is waiting for you to take it. Tap Claim so it is yours.',
          'For to-dos, tap Done when finished or Skip if it is not needed.',
          'Managers can pick a person at the top to see their list.',
        ],
      },
      es: {
        title: 'Hoy: a quién llamar',
        summary: 'Tu lista del día: prospectos nuevos por responder, seguimientos, tareas, cotizaciones abiertas y citas.',
        steps: [
          'Abre Hoy al empezar el día. Los prospectos nuevos están arriba: respóndelos primero; cuanto más rápido respondes, más vendes.',
          'Toca Llamar o Mensaje en la misma fila. El prospecto queda marcado como contactado.',
          'Un botón amarillo Reclamar significa que un prospecto nuevo te espera. Toca Reclamar para que sea tuyo.',
          'En las tareas, toca Hecho al terminar u Omitir si no hace falta.',
          'Los gerentes pueden elegir una persona arriba para ver su lista.',
        ],
      },
      fr: {
        title: 'Aujourd’hui : qui appeler',
        summary: 'Votre liste du jour : nouveaux prospects à qui répondre, relances, tâches, devis ouverts et rendez-vous.',
        steps: [
          'Ouvrez Aujourd’hui en premier. Les nouveaux prospects sont en haut : répondez-leur d’abord ; plus vous répondez vite, plus vous vendez.',
          'Touchez Appeler ou SMS directement sur la ligne. Le prospect est noté comme contacté.',
          'Un bouton jaune Prendre signifie qu’un nouveau prospect vous attend. Touchez Prendre pour qu’il soit à vous.',
          'Pour les tâches, touchez Fait une fois terminé ou Passer si ce n’est pas utile.',
          'Les responsables peuvent choisir une personne en haut pour voir sa liste.',
        ],
      },
      ht: {
        title: 'Jodi a: ki moun pou rele',
        summary: 'Lis ou pou jounen an: nouvo kliyan pou reponn, swivi, travay, kotasyon yo louvri ak randevou.',
        steps: [
          'Louvri Jodi a an premye. Nouvo kliyan yo anlè — reponn yo an premye; plis ou reponn vit, plis ou vann.',
          'Peze Rele oswa Tèks dirèkteman sou liy lan. Kliyan an make kòm kontakte pou ou.',
          'Yon bouton jòn Pran li vle di yon nouvo kliyan ap tann ou. Peze Pran li pou li vin pou ou.',
          'Pou travay yo, peze Fini lè ou fini oswa Sote si li pa nesesè.',
          'Manadjè yo ka chwazi yon moun anlè a pou wè lis li.',
        ],
      },
    },
  },
  {
    id: 'texts',
    area: 'sellMore',
    path: '/mp/texts',
    keywords: 'texts sms text messages replies stop opt out quiet hours texting phone consent',
    text: {
      en: {
        title: 'Texts, replies and STOP',
        summary: 'See every text sent to customers, their replies, and the numbers that asked not to be texted.',
        steps: [
          'Texts go out from the store’s texting phone (or Twilio, if your admin set it up). The top of the page shows if each store’s texting phone is online.',
          'When a customer texts back, the reply shows under Replies and the salesperson gets a notification.',
          'If a customer replies STOP, the number is opted out and nobody can text it again. HELP sends them our contact info.',
          'To stop texting a number yourself, type it under opt-outs and tap Don’t text this number. Use Allow texts again only if the customer asks.',
          'Automatic texts wait until quiet hours are over, so nobody gets a text at night.',
          'Only text customers who agreed to it — the consent box on our customer forms records their answer.',
        ],
      },
      es: {
        title: 'Mensajes, respuestas y STOP',
        summary: 'Mira cada mensaje enviado a clientes, sus respuestas y los números que pidieron no recibir mensajes.',
        steps: [
          'Los mensajes salen del teléfono de mensajes de la tienda (o de Twilio, si tu administrador lo configuró). Arriba ves si el teléfono de cada tienda está en línea.',
          'Cuando un cliente responde, la respuesta aparece en Respuestas y el vendedor recibe un aviso.',
          'Si un cliente responde STOP, el número queda dado de baja y nadie puede volver a escribirle. HELP le envía nuestros datos de contacto.',
          'Para dejar de escribir a un número tú mismo, escríbelo en las bajas y toca No enviar mensajes a este número. Usa Permitir mensajes otra vez solo si el cliente lo pide.',
          'Los mensajes automáticos esperan a que termine el horario de silencio, así nadie recibe mensajes de noche.',
          'Escribe solo a clientes que lo aceptaron: la casilla de consentimiento de nuestros formularios guarda su respuesta.',
        ],
      },
      fr: {
        title: 'SMS, réponses et STOP',
        summary: 'Voyez chaque SMS envoyé aux clients, leurs réponses et les numéros qui ne veulent plus de SMS.',
        steps: [
          'Les SMS partent du téléphone SMS du magasin (ou de Twilio, si votre admin l’a configuré). En haut, vous voyez si le téléphone de chaque magasin est en ligne.',
          'Quand un client répond, la réponse s’affiche dans Réponses et le vendeur reçoit une notification.',
          'Si un client répond STOP, le numéro est désabonné et personne ne peut plus lui écrire. HELP lui envoie nos coordonnées.',
          'Pour ne plus écrire à un numéro vous-même, tapez-le dans les désabonnements et touchez Ne pas écrire à ce numéro. N’utilisez Autoriser à nouveau que si le client le demande.',
          'Les SMS automatiques attendent la fin des heures calmes : personne ne reçoit de SMS la nuit.',
          'N’écrivez qu’aux clients qui ont accepté : la case de consentement de nos formulaires enregistre leur réponse.',
        ],
      },
      ht: {
        title: 'Tèks, repons ak STOP',
        summary: 'Wè chak tèks yo voye bay kliyan, repons yo, ak nimewo ki mande pou yo pa resevwa tèks.',
        steps: [
          'Tèks yo pati sou telefòn tèks magazen an (oswa Twilio, si admin ou mete l). Anlè paj la montre si telefòn tèks chak magazen sou liy.',
          'Lè yon kliyan reponn, repons lan parèt nan Repons epi vandè a resevwa yon notifikasyon.',
          'Si yon kliyan reponn STOP, nimewo a soti nan lis la epi pèsonn pa ka voye tèks ba li ankò. HELP voye enfòmasyon kontak nou ba li.',
          'Pou w sispann voye tèks bay yon nimewo, ekri l nan lis la epi peze Pa voye tèks bay nimewo sa a. Sèvi ak Pèmèt tèks ankò sèlman si kliyan an mande sa.',
          'Tèks otomatik yo tann lè silans lan fini, konsa pèsonn pa resevwa tèks lannwit.',
          'Voye tèks sèlman bay kliyan ki dakò — bwat konsantman an sou fòm nou yo anrejistre repons yo.',
        ],
      },
    },
  },
  {
    id: 'appointments',
    area: 'sellMore',
    path: '/mp/appointments',
    keywords: 'appointments booking link book test drive visit calendar reminder schedule',
    text: {
      en: {
        title: 'Appointments & the booking link',
        summary: 'Customers book a test drive or store visit with your booking link; you can also add appointments yourself.',
        steps: [
          'Send the booking link (from a lead, a quote or Sell more settings). The customer picks a store, a day and a time — no sign-in needed.',
          'To add one yourself, open Appointments, tap Add, and fill in the customer, store, day and time.',
          'Customers who ticked the texting box get reminder texts before the visit.',
          'Use Reschedule or Cancel on an appointment if plans change.',
          'Booking hours and how many people fit in one time slot are set in Sell more settings → Quotes, booking & trade-ins.',
        ],
      },
      es: {
        title: 'Citas y el enlace de reservas',
        summary: 'Los clientes reservan una prueba de manejo o una visita con tu enlace de reservas; también puedes agregar citas tú mismo.',
        steps: [
          'Envía el enlace de reservas (desde un prospecto, una cotización o los ajustes de Vender más). El cliente elige tienda, día y hora, sin iniciar sesión.',
          'Para agregar una tú mismo, abre Citas, toca Agregar y llena el cliente, la tienda, el día y la hora.',
          'Los clientes que marcaron la casilla de mensajes reciben recordatorios antes de la visita.',
          'Usa Reprogramar o Cancelar en una cita si los planes cambian.',
          'El horario de reservas y cuántas personas caben en cada horario se configuran en Ajustes de Vender más → Cotizaciones, reservas e intercambios.',
        ],
      },
      fr: {
        title: 'Rendez-vous et lien de réservation',
        summary: 'Les clients réservent un essai ou une visite avec votre lien de réservation ; vous pouvez aussi ajouter des rendez-vous vous-même.',
        steps: [
          'Envoyez le lien de réservation (depuis un prospect, un devis ou les réglages Vendre plus). Le client choisit un magasin, un jour et une heure, sans connexion.',
          'Pour en ajouter un vous-même, ouvrez Rendez-vous, touchez Ajouter et indiquez le client, le magasin, le jour et l’heure.',
          'Les clients qui ont coché la case SMS reçoivent des rappels avant la visite.',
          'Utilisez Reporter ou Annuler sur un rendez-vous si les plans changent.',
          'Les heures de réservation et le nombre de personnes par créneau se règlent dans Réglages Vendre plus → Devis, réservations et reprises.',
        ],
      },
      ht: {
        title: 'Randevou ak lyen rezèvasyon an',
        summary: 'Kliyan yo pran randevou pou eseye yon kabwèt oswa vizite magazen an ak lyen ou; ou ka ajoute randevou tou.',
        steps: [
          'Voye lyen rezèvasyon an (nan yon kliyan, yon kotasyon oswa paramèt Vann plis). Kliyan an chwazi magazen, jou ak lè — li pa bezwen konekte.',
          'Pou ajoute youn ou menm, louvri Randevou, peze Ajoute, epi ranpli kliyan an, magazen an, jou a ak lè a.',
          'Kliyan ki te tcheke bwat tèks la resevwa tèks rapèl anvan vizit la.',
          'Sèvi ak Chanje dat oswa Anile sou yon randevou si plan yo chanje.',
          'Lè rezèvasyon ak konbyen moun ki ka antre nan chak lè mete nan Paramèt Vann plis → Kotasyon, rezèvasyon ak echanj.',
        ],
      },
    },
  },
  {
    id: 'quotes',
    area: 'sellMore',
    path: '/mp/quotes',
    keywords: 'quotes send quote opened alert out the door price payment interested link',
    text: {
      en: {
        title: 'Quotes: send, and know when they open it',
        summary: 'Send a customer a quote page with the out-the-door price and monthly payments. You get an alert the moment they open it.',
        steps: [
          'Open Financing, build the price for the cart, then tap Send quote and pick the lead.',
          'The customer gets a link to a clean quote page — price, payment options, your name and a booking button.',
          'When they open it you get a notification, and it shows on Today under “Opened your quote”. Call them right away.',
          'If they tap “I’m interested”, you get their best time to call.',
          'Quotes shows every quote you sent: opened or not, and expired ones.',
        ],
      },
      es: {
        title: 'Cotizaciones: envíalas y entérate cuando las abren',
        summary: 'Envía al cliente una página con el precio final y los pagos mensuales. Recibes un aviso en cuanto la abre.',
        steps: [
          'Abre Financiamiento, arma el precio del carrito, toca Enviar cotización y elige el prospecto.',
          'El cliente recibe un enlace a una página clara: precio, opciones de pago, tu nombre y un botón para reservar.',
          'Cuando la abre recibes un aviso, y aparece en Hoy en “Abrieron tu cotización”. Llámalo enseguida.',
          'Si toca “Me interesa”, recibes su mejor horario para llamarlo.',
          'Cotizaciones muestra todas las que enviaste: abiertas o no, y las vencidas.',
        ],
      },
      fr: {
        title: 'Devis : envoyez-les et sachez quand ils sont ouverts',
        summary: 'Envoyez au client une page de devis avec le prix total et les paiements mensuels. Vous êtes alerté dès qu’il l’ouvre.',
        steps: [
          'Ouvrez Financement, calculez le prix de la voiturette, puis touchez Envoyer le devis et choisissez le prospect.',
          'Le client reçoit un lien vers une page claire : prix, options de paiement, votre nom et un bouton de réservation.',
          'Quand il l’ouvre, vous recevez une notification et il apparaît dans Aujourd’hui sous « Ont ouvert votre devis ». Appelez-le tout de suite.',
          'S’il touche « Je suis intéressé », vous recevez son meilleur moment pour l’appeler.',
          'Devis affiche tous les devis envoyés : ouverts ou non, et expirés.',
        ],
      },
      ht: {
        title: 'Kotasyon: voye yo, epi konnen lè yo louvri yo',
        summary: 'Voye bay kliyan an yon paj kotasyon ak pri total la ak peman chak mwa. Ou resevwa yon alèt menm lè li louvri l.',
        steps: [
          'Louvri Finansman, kalkile pri kabwèt la, epi peze Voye kotasyon epi chwazi kliyan an.',
          'Kliyan an resevwa yon lyen pou yon paj klè — pri, opsyon peman, non ou ak yon bouton pou pran randevou.',
          'Lè li louvri l, ou resevwa yon notifikasyon, epi li parèt nan Jodi a anba “Yo louvri kotasyon ou”. Rele l touswit.',
          'Si li peze “Mwen enterese”, ou resevwa pi bon lè pou rele l.',
          'Kotasyon montre tout kotasyon ou voye: louvri oswa non, ak sa ki ekspire.',
        ],
      },
    },
  },
  {
    id: 'trade-ins',
    area: 'sellMore',
    path: '/mp/trade-ins',
    keywords: 'trade in trade-in value estimate appraise photos worth',
    text: {
      en: {
        title: 'Trade-ins',
        summary: 'Customers fill in the trade-in page and get an estimated value range. You review it and set the real value.',
        steps: [
          'Send the trade-in link to a customer (or put it on the website). They enter the cart’s year, brand, condition and photos.',
          'They see an estimated range right away, and the trade-in shows up here and on their lead.',
          'Look at the photos, then enter the Appraised value and set the status (Appraised, Accepted or Declined).',
          'Tap Open calculator to use the trade-in in a quote.',
          'The value ranges are set in Sell more settings → Quotes, booking & trade-ins.',
        ],
      },
      es: {
        title: 'Intercambios',
        summary: 'Los clientes llenan la página de intercambio y reciben un rango de valor estimado. Tú lo revisas y fijas el valor real.',
        steps: [
          'Envía el enlace de intercambio al cliente (o ponlo en el sitio web). Escribe el año, la marca, el estado y sube fotos del carrito.',
          'Ve un rango estimado al instante, y el intercambio aparece aquí y en su prospecto.',
          'Mira las fotos, escribe el Valor tasado y elige el estado (Tasado, Aceptado o Rechazado).',
          'Toca Abrir calculadora para usar el intercambio en una cotización.',
          'Los rangos de valor se configuran en Ajustes de Vender más → Cotizaciones, reservas e intercambios.',
        ],
      },
      fr: {
        title: 'Reprises',
        summary: 'Les clients remplissent la page de reprise et obtiennent une fourchette de valeur estimée. Vous la vérifiez et fixez la vraie valeur.',
        steps: [
          'Envoyez le lien de reprise au client (ou mettez-le sur le site). Il indique l’année, la marque, l’état et ajoute des photos.',
          'Il voit tout de suite une fourchette estimée, et la reprise apparaît ici et sur son prospect.',
          'Regardez les photos, indiquez la Valeur estimée et choisissez le statut (Évaluée, Acceptée ou Refusée).',
          'Touchez Ouvrir la calculatrice pour utiliser la reprise dans un devis.',
          'Les fourchettes se règlent dans Réglages Vendre plus → Devis, réservations et reprises.',
        ],
      },
      ht: {
        title: 'Echanj',
        summary: 'Kliyan yo ranpli paj echanj lan epi yo jwenn yon valè estime. Ou gade l epi ou mete vrè valè a.',
        steps: [
          'Voye lyen echanj lan bay kliyan an (oswa mete l sou sit entènèt la). Li mete ane, mak, eta ak foto kabwèt la.',
          'Li wè yon valè estime touswit, epi echanj lan parèt isit la ak sou kliyan an.',
          'Gade foto yo, epi mete Valè evalye a ak eta a (Evalye, Aksepte oswa Refize).',
          'Peze Louvri kalkilatris pou sèvi ak echanj lan nan yon kotasyon.',
          'Valè yo mete nan Paramèt Vann plis → Kotasyon, rezèvasyon ak echanj.',
        ],
      },
    },
  },
  {
    id: 'prequal',
    area: 'sellMore',
    path: '/mp/prequal',
    keywords: 'pre-qualification prequal credit lender financing soft pull approved',
    text: {
      en: {
        title: 'Pre-qualification',
        summary: 'Customers answer a few questions about credit and budget, then get links to the lenders that fit. No credit check by us.',
        steps: [
          'Send the pre-qualification link to a customer (or put it on the website).',
          'They pick a credit range, monthly budget and down payment. They then see lender links; checking with lenders does not affect their credit.',
          'The answers show up here and on their lead. Call them to help pick the best option.',
          'When you hear back, set the status, credit tier, lender and the amount they were approved for.',
          'Tap Open calculator to turn it into a quote.',
        ],
      },
      es: {
        title: 'Precalificación',
        summary: 'Los clientes responden unas preguntas sobre su crédito y presupuesto y reciben enlaces a los prestamistas adecuados. Nosotros no revisamos su crédito.',
        steps: [
          'Envía el enlace de precalificación al cliente (o ponlo en el sitio web).',
          'Elige su rango de crédito, presupuesto mensual y pago inicial. Luego ve enlaces de prestamistas; consultarlos no afecta su crédito.',
          'Las respuestas aparecen aquí y en su prospecto. Llámalo para ayudarle a elegir la mejor opción.',
          'Cuando tengas respuesta, pon el estado, el nivel de crédito, el prestamista y el monto aprobado.',
          'Toca Abrir calculadora para convertirlo en una cotización.',
        ],
      },
      fr: {
        title: 'Préqualification',
        summary: 'Les clients répondent à quelques questions sur leur crédit et leur budget, puis reçoivent les liens des prêteurs adaptés. Nous ne vérifions pas leur crédit.',
        steps: [
          'Envoyez le lien de préqualification au client (ou mettez-le sur le site).',
          'Il choisit son niveau de crédit, son budget mensuel et son acompte. Il voit ensuite des liens de prêteurs ; cela n’affecte pas son crédit.',
          'Les réponses apparaissent ici et sur son prospect. Appelez-le pour l’aider à choisir la meilleure option.',
          'Quand vous avez la réponse, indiquez le statut, le niveau de crédit, le prêteur et le montant approuvé.',
          'Touchez Ouvrir la calculatrice pour en faire un devis.',
        ],
      },
      ht: {
        title: 'Pre-kalifikasyon',
        summary: 'Kliyan yo reponn kèk kesyon sou kredi ak bidjè yo, epi yo jwenn lyen prètè ki bon pou yo. Nou pa tcheke kredi yo.',
        steps: [
          'Voye lyen pre-kalifikasyon an bay kliyan an (oswa mete l sou sit entènèt la).',
          'Li chwazi nivo kredi li, bidjè chak mwa ak avans li. Apre sa li wè lyen prètè yo; sa pa afekte kredi li.',
          'Repons yo parèt isit la ak sou kliyan an. Rele l pou ede l chwazi pi bon opsyon an.',
          'Lè ou jwenn repons, mete eta a, nivo kredi a, prètè a ak kantite yo apwouve a.',
          'Peze Louvri kalkilatris pou fè l tounen yon kotasyon.',
        ],
      },
    },
  },
  {
    id: 'aged',
    area: 'sellMore',
    path: '/mp/aged',
    keywords: 'aged inventory days on lot price drop suggested price urgent old carts',
    text: {
      en: {
        title: 'Aged inventory & price drops',
        summary: 'See the carts that have been on the lot the longest, with a suggested price to help them sell.',
        steps: [
          'Aged inventory lists carts by days on the lot. Aged and Urgent flags show which ones need attention first.',
          'Filter by store to see your own lot.',
          'Post an aged cart again (Prepare listing or Auto Post) — a fresh post often brings new buyers.',
          'Each cart page shows its days on the lot, the suggested price and past price drops.',
          'Managers set the aged and urgent days and the suggested cut in Sell more settings → Inventory.',
        ],
      },
      es: {
        title: 'Inventario antiguo y bajadas de precio',
        summary: 'Mira los carritos que llevan más tiempo en el lote, con un precio sugerido para ayudar a venderlos.',
        steps: [
          'Inventario antiguo ordena los carritos por días en el lote. Las marcas Antiguo y Urgente indican cuáles atender primero.',
          'Filtra por tienda para ver tu propio lote.',
          'Vuelve a publicar un carrito antiguo (Preparar anuncio o Auto Post): una publicación nueva suele atraer compradores.',
          'La página de cada carrito muestra sus días en el lote, el precio sugerido y las bajadas de precio anteriores.',
          'Los gerentes fijan los días para Antiguo y Urgente y la rebaja sugerida en Ajustes de Vender más → Inventario.',
        ],
      },
      fr: {
        title: 'Stock ancien et baisses de prix',
        summary: 'Voyez les voiturettes qui sont sur le parc depuis le plus longtemps, avec un prix suggéré pour les vendre.',
        steps: [
          'Stock ancien classe les voiturettes par jours sur le parc. Les marques Ancien et Urgent montrent celles à traiter en premier.',
          'Filtrez par magasin pour voir votre parc.',
          'Republiez une voiturette ancienne (Préparer l’annonce ou Auto Post) : une nouvelle annonce attire souvent de nouveaux acheteurs.',
          'La page de chaque voiturette montre ses jours sur le parc, le prix suggéré et les baisses de prix passées.',
          'Les responsables règlent les jours Ancien et Urgent et la baisse suggérée dans Réglages Vendre plus → Stock.',
        ],
      },
      ht: {
        title: 'Envantè ki vye ak bès pri',
        summary: 'Wè kabwèt ki rete pi lontan sou lo a, ak yon pri sijere pou ede yo vann.',
        steps: [
          'Envantè ki vye montre kabwèt yo dapre konbyen jou yo sou lo a. Mak Vye ak Ijan montre sa pou okipe an premye.',
          'Filtre pa magazen pou wè lo pa ou.',
          'Pibliye yon kabwèt ki vye ankò (Prepare anons oswa Auto Post) — yon nouvo piblikasyon souvan pote nouvo achtè.',
          'Paj chak kabwèt montre konbyen jou li sou lo a, pri sijere a ak bès pri ki te fèt deja.',
          'Manadjè yo mete jou pou Vye ak Ijan ak rabè sijere a nan Paramèt Vann plis → Envantè.',
        ],
      },
    },
  },
  {
    id: 'referrals',
    area: 'sellMore',
    path: '/mp/referrals',
    keywords: 'referrals referral link friend reward happy customer',
    text: {
      en: {
        title: 'Referrals',
        summary: 'Happy buyers get their own link to share. When a friend buys through it, the buyer earns a reward.',
        steps: [
          'Buyers get a referral link after a sale. You can also make one for any happy customer: tap Create referral link, then enter their name and phone.',
          'They share the link. Their friend sees a short page and leaves their name and phone (the texting box is optional).',
          'The friend becomes a new lead, marked as a referral, and is assigned like any other lead.',
          'When the friend buys, the referral shows the reward owed. Tap Mark paid once the buyer has been paid.',
          'The reward amount is set in Sell more settings → Reviews & referrals.',
        ],
      },
      es: {
        title: 'Referidos',
        summary: 'Los compradores felices reciben su propio enlace para compartir. Cuando un amigo compra con él, el comprador gana una recompensa.',
        steps: [
          'Los compradores reciben un enlace de referido después de una venta. También puedes crear uno para cualquier cliente feliz: toca Crear enlace de referido y escribe su nombre y teléfono.',
          'Comparten el enlace. Su amigo ve una página corta y deja su nombre y teléfono (la casilla de mensajes es opcional).',
          'El amigo se convierte en un prospecto nuevo, marcado como referido, y se asigna como cualquier otro.',
          'Cuando el amigo compra, el referido muestra la recompensa pendiente. Toca Marcar pagado cuando el comprador haya recibido su pago.',
          'El monto de la recompensa se configura en Ajustes de Vender más → Reseñas y referidos.',
        ],
      },
      fr: {
        title: 'Parrainages',
        summary: 'Les acheteurs satisfaits reçoivent leur propre lien à partager. Quand un ami achète grâce à lui, l’acheteur gagne une récompense.',
        steps: [
          'Les acheteurs reçoivent un lien de parrainage après une vente. Vous pouvez aussi en créer un pour un client satisfait : touchez Créer un lien de parrainage, puis saisissez son nom et son téléphone.',
          'Il partage le lien. Son ami voit une courte page et laisse son nom et son téléphone (la case SMS est facultative).',
          'L’ami devient un nouveau prospect, marqué comme parrainage, et il est attribué comme les autres.',
          'Quand l’ami achète, le parrainage indique la récompense due. Touchez Marquer payé une fois l’acheteur payé.',
          'Le montant de la récompense se règle dans Réglages Vendre plus → Avis et parrainages.',
        ],
      },
      ht: {
        title: 'Referans',
        summary: 'Achtè ki kontan yo jwenn pwòp lyen pa yo pou pataje. Lè yon zanmi achte ak li, achtè a genyen yon rekonpans.',
        steps: [
          'Achtè yo jwenn yon lyen referans apre yon vant. Ou ka fè youn tou pou nenpòt kliyan ki kontan: peze Kreye lyen referans, epi mete non ak telefòn li.',
          'Yo pataje lyen an. Zanmi yo wè yon ti paj epi li kite non ak telefòn li (bwat tèks la pa obligatwa).',
          'Zanmi an vin yon nouvo kliyan, make kòm referans, epi li bay yon vandè tankou lòt yo.',
          'Lè zanmi an achte, referans lan montre rekonpans yo dwe a. Peze Make peye lè achtè a fin resevwa lajan l.',
          'Kantite rekonpans lan mete nan Paramèt Vann plis → Revi ak referans.',
        ],
      },
    },
  },
  {
    id: 'funnel',
    area: 'sellMore',
    path: '/mp/funnel',
    keywords: 'sales funnel conversion where leads go lost reasons manager report',
    text: {
      en: {
        title: 'Sales funnel',
        summary: 'For managers: see where leads go — contacted, quote, appointment, test drive, sold — and where we lose them.',
        steps: [
          'Pick a period (This week, This month, Last 30 or 90 days, or your own dates), and optionally a store or a salesperson.',
          'The funnel shows how many leads reached each step: Contacted, Quotes, Appointments, Test drives and Sold.',
          'The table compares stores and salespeople: average reply time, close rate and revenue.',
          'A big drop between two steps shows where to coach the team — for example slow replies or missing follow-ups.',
        ],
      },
      es: {
        title: 'Embudo de ventas',
        summary: 'Para gerentes: mira a dónde van los prospectos (contactado, cotización, cita, prueba de manejo, vendido) y dónde los perdemos.',
        steps: [
          'Elige un período (Esta semana, Este mes, Últimos 30 o 90 días, o tus propias fechas) y, si quieres, una tienda o un vendedor.',
          'El embudo muestra cuántos prospectos llegaron a cada paso: Contactado, Cotizaciones, Citas, Pruebas de manejo y Vendido.',
          'La tabla compara tiendas y vendedores: tiempo promedio de respuesta, tasa de cierre e ingresos.',
          'Una caída grande entre dos pasos muestra dónde entrenar al equipo, por ejemplo respuestas lentas o falta de seguimiento.',
        ],
      },
      fr: {
        title: 'Entonnoir de vente',
        summary: 'Pour les responsables : voyez où vont les prospects (contacté, devis, rendez-vous, essai, vendu) et où nous les perdons.',
        steps: [
          'Choisissez une période (Cette semaine, Ce mois-ci, 30 ou 90 derniers jours, ou vos dates) et, si besoin, un magasin ou un vendeur.',
          'L’entonnoir montre combien de prospects ont atteint chaque étape : Contacté, Devis, Rendez-vous, Essais et Vendu.',
          'Le tableau compare magasins et vendeurs : délai moyen de réponse, taux de conclusion et chiffre d’affaires.',
          'Une forte baisse entre deux étapes montre où accompagner l’équipe, par exemple des réponses lentes ou des relances oubliées.',
        ],
      },
      ht: {
        title: 'Antonwa vant',
        summary: 'Pou manadjè: wè ki kote kliyan yo ale — kontakte, kotasyon, randevou, esè, vann — ak ki kote nou pèdi yo.',
        steps: [
          'Chwazi yon peryòd (Semèn sa a, Mwa sa a, 30 oswa 90 dènye jou, oswa pwòp dat ou), epi si ou vle, yon magazen oswa yon vandè.',
          'Antonwa a montre konbyen kliyan ki rive nan chak etap: Kontakte, Kotasyon, Randevou, Esè ak Vann.',
          'Tablo a konpare magazen ak vandè yo: tan mwayen pou reponn, to vant ak lajan ki antre.',
          'Yon gwo bès ant de etap montre ki kote pou ede ekip la — pa egzanp repons ki twò lan oswa swivi ki pa fèt.',
        ],
      },
    },
  },
  {
    id: 'reviews',
    area: 'sellMore',
    path: '/mp/reviews',
    keywords: 'google reviews rating stars review request link business profile',
    text: {
      en: {
        title: 'Google reviews',
        summary: 'For managers: each store’s Google rating and newest reviews, plus an easy way to ask buyers for a review.',
        steps: [
          'See each store’s rating, review count and new reviews this week and this month.',
          'Tap Reply on Google to answer a review in the store’s Google Business Profile.',
          'To get more reviews, open a sold lead and tap Review request, or use Copy review link and send it to the buyer.',
          'First time? An admin adds each store’s Google Place ID in Sell more settings → Reviews & referrals, and the Google key must be set up.',
        ],
      },
      es: {
        title: 'Reseñas de Google',
        summary: 'Para gerentes: la calificación de Google de cada tienda y sus reseñas más nuevas, y una forma fácil de pedir reseñas a los compradores.',
        steps: [
          'Mira la calificación de cada tienda, el número de reseñas y las nuevas de esta semana y este mes.',
          'Toca Responder en Google para contestar una reseña en el perfil de Google de la tienda.',
          'Para conseguir más reseñas, abre un prospecto vendido y toca Pedir reseña, o usa Copiar enlace de reseña y envíalo al comprador.',
          '¿Primera vez? Un administrador agrega el Place ID de Google de cada tienda en Ajustes de Vender más → Reseñas y referidos, y la clave de Google debe estar configurada.',
        ],
      },
      fr: {
        title: 'Avis Google',
        summary: 'Pour les responsables : la note Google de chaque magasin et les derniers avis, plus un moyen simple de demander un avis aux acheteurs.',
        steps: [
          'Voyez la note de chaque magasin, le nombre d’avis et les nouveaux avis de la semaine et du mois.',
          'Touchez Répondre sur Google pour répondre à un avis dans la fiche Google du magasin.',
          'Pour obtenir plus d’avis, ouvrez un prospect vendu et touchez Demander un avis, ou utilisez Copier le lien d’avis et envoyez-le à l’acheteur.',
          'Première fois ? Un admin ajoute le Place ID Google de chaque magasin dans Réglages Vendre plus → Avis et parrainages, et la clé Google doit être configurée.',
        ],
      },
      ht: {
        title: 'Revi Google',
        summary: 'Pou manadjè: nòt Google chak magazen ak dènye revi yo, plis yon fason fasil pou mande achtè yo yon revi.',
        steps: [
          'Wè nòt chak magazen, konbyen revi li genyen ak nouvo revi semèn sa a ak mwa sa a.',
          'Peze Reponn sou Google pou reponn yon revi nan pwofil Google magazen an.',
          'Pou jwenn plis revi, louvri yon kliyan ki achte epi peze Mande yon revi, oswa sèvi ak Kopye lyen revi a epi voye l bay achtè a.',
          'Premye fwa? Yon admin mete Place ID Google chak magazen nan Paramèt Vann plis → Revi ak referans, epi kle Google la dwe mete.',
        ],
      },
    },
  },
  // ---------------------------------------------------------------- Sell
  {
    id: 'financing',
    area: 'sell',
    path: '/mp/finance',
    keywords: 'financing calculator payment monthly lender rate tax delivery out the door quote',
    text: {
      en: {
        title: 'Financing calculator',
        summary: 'Work out the out-the-door price and monthly payments for any cart, then send it as a quote.',
        steps: [
          'Open Financing. Pick the brand and enter the cart price, accessories and dealer prep fee.',
          'Pick the store and the delivery destination; the delivery fee and sales tax are added for you.',
          'Enter the down payment and any trade-in. The table shows monthly payments for each lender and term.',
          'Tick the options you want to show the customer.',
          'Tap Send quote to text or email the customer a quote page (see “Quotes”).',
        ],
      },
      es: {
        title: 'Calculadora de financiamiento',
        summary: 'Calcula el precio final y los pagos mensuales de cualquier carrito, y luego envíalo como cotización.',
        steps: [
          'Abre Financiamiento. Elige la marca y escribe el precio del carrito, los accesorios y la preparación.',
          'Elige la tienda y el destino de entrega; el costo de entrega y el impuesto se suman solos.',
          'Escribe el pago inicial y el intercambio, si hay. La tabla muestra los pagos mensuales de cada prestamista y plazo.',
          'Marca las opciones que quieres mostrar al cliente.',
          'Toca Enviar cotización para mandar al cliente una página de cotización (mira “Cotizaciones”).',
        ],
      },
      fr: {
        title: 'Calculatrice de financement',
        summary: 'Calculez le prix total et les paiements mensuels de n’importe quelle voiturette, puis envoyez-les en devis.',
        steps: [
          'Ouvrez Financement. Choisissez la marque et indiquez le prix de la voiturette, les accessoires et les frais de préparation.',
          'Choisissez le magasin et la destination de livraison ; les frais de livraison et la taxe sont ajoutés pour vous.',
          'Indiquez l’acompte et la reprise éventuelle. Le tableau montre les paiements mensuels par prêteur et par durée.',
          'Cochez les options à montrer au client.',
          'Touchez Envoyer le devis pour envoyer une page de devis au client (voir « Devis »).',
        ],
      },
      ht: {
        title: 'Kalkilatris finansman',
        summary: 'Kalkile pri total la ak peman chak mwa pou nenpòt kabwèt, epi voye l kòm kotasyon.',
        steps: [
          'Louvri Finansman. Chwazi mak la epi mete pri kabwèt la, akseswa yo ak frè preparasyon an.',
          'Chwazi magazen an ak kote pou livre l; frè livrezon ak taks yo ajoute pou ou.',
          'Mete avans lan ak echanj la si genyen. Tablo a montre peman chak mwa pou chak prètè ak dire.',
          'Tcheke opsyon ou vle montre kliyan an.',
          'Peze Voye kotasyon pou voye yon paj kotasyon bay kliyan an (gade “Kotasyon”).',
        ],
      },
    },
  },
  {
    id: 'find-cart',
    area: 'sell',
    path: '/mp/find',
    keywords: 'find a cart browse search filter inventory stock locations brand model price',
    text: {
      en: {
        title: 'Find a cart & Browse',
        summary: 'Search the whole inventory of all stores to find the right cart for a customer.',
        steps: [
          'Find a Cart: pick what the customer wants — price, brand, seats, gas or electric, lifted, color, store — and see the matches.',
          'Browse: scroll every cart, sort and search by name or stock number.',
          'Locations: see the carts at one store.',
          'Open a cart to see photos and details, then Prepare listing, Auto Post, Share or Send quote.',
        ],
      },
      es: {
        title: 'Buscar carrito y Explorar',
        summary: 'Busca en el inventario de todas las tiendas el carrito ideal para un cliente.',
        steps: [
          'Buscar carrito: elige lo que quiere el cliente (precio, marca, asientos, gasolina o eléctrico, elevado, color, tienda) y mira los resultados.',
          'Explorar: recorre todos los carritos, ordena y busca por nombre o número de inventario.',
          'Ubicaciones: mira los carritos de una tienda.',
          'Abre un carrito para ver fotos y detalles, y luego Preparar anuncio, Auto Post, Compartir o Enviar cotización.',
        ],
      },
      fr: {
        title: 'Trouver une voiturette et Parcourir',
        summary: 'Cherchez dans le stock de tous les magasins la bonne voiturette pour un client.',
        steps: [
          'Trouver une voiturette : choisissez ce que veut le client (prix, marque, places, essence ou électrique, surélevée, couleur, magasin) et voyez les résultats.',
          'Parcourir : faites défiler toutes les voiturettes, triez et cherchez par nom ou numéro de stock.',
          'Magasins : voyez les voiturettes d’un magasin.',
          'Ouvrez une voiturette pour voir photos et détails, puis Préparer l’annonce, Auto Post, Partager ou Envoyer le devis.',
        ],
      },
      ht: {
        title: 'Jwenn yon kabwèt ak Gade',
        summary: 'Chèche nan tout envantè tout magazen yo pou jwenn bon kabwèt pou yon kliyan.',
        steps: [
          'Jwenn yon kabwèt: chwazi sa kliyan an vle — pri, mak, plas, gaz oswa elektrik, leve, koulè, magazen — epi wè sa ki matche.',
          'Gade: fè defile tout kabwèt yo, triye epi chèche pa non oswa nimewo envantè.',
          'Kote yo: wè kabwèt ki nan yon magazen.',
          'Louvri yon kabwèt pou wè foto ak detay, epi Prepare anons, Auto Post, Pataje oswa Voye kotasyon.',
        ],
      },
    },
  },
  // ---------------------------------------------------------------- Customers
  {
    id: 'customers',
    area: 'customers',
    path: '/mp/customers',
    keywords: 'customers buyers past customers tags store sms whatsapp email consent',
    text: {
      en: {
        title: 'Customers',
        summary: 'Everyone who bought from us. Buyers are added automatically when you mark a lead sold.',
        steps: [
          'Mark a lead sold and the buyer is saved here with the cart and the date.',
          'Search, or filter by store or tag, to find a customer quickly.',
          'Open a customer to call, text, WhatsApp or email them, and to add notes or tags.',
          'Only text or email customers who agreed to it — their consent is saved on the customer.',
        ],
      },
      es: {
        title: 'Clientes',
        summary: 'Todas las personas que nos compraron. Los compradores se agregan solos cuando marcas un prospecto como vendido.',
        steps: [
          'Marca un prospecto como vendido y el comprador se guarda aquí con el carrito y la fecha.',
          'Busca, o filtra por tienda o etiqueta, para encontrar a un cliente rápido.',
          'Abre un cliente para llamarlo, escribirle por mensaje, WhatsApp o correo, y agregar notas o etiquetas.',
          'Escribe o envía correos solo a clientes que lo aceptaron: su consentimiento se guarda en el cliente.',
        ],
      },
      fr: {
        title: 'Clients',
        summary: 'Toutes les personnes qui nous ont acheté. Les acheteurs sont ajoutés automatiquement quand vous marquez un prospect vendu.',
        steps: [
          'Marquez un prospect vendu et l’acheteur est enregistré ici avec la voiturette et la date.',
          'Cherchez, ou filtrez par magasin ou étiquette, pour trouver un client vite.',
          'Ouvrez un client pour l’appeler, lui écrire par SMS, WhatsApp ou e-mail, et ajouter des notes ou des étiquettes.',
          'N’écrivez qu’aux clients qui ont accepté : leur consentement est enregistré sur la fiche client.',
        ],
      },
      ht: {
        title: 'Kliyan',
        summary: 'Tout moun ki te achte nan men nou. Achtè yo ajoute otomatikman lè ou make yon kliyan potansyèl vann.',
        steps: [
          'Make yon kliyan potansyèl vann epi achtè a sove isit la ak kabwèt la ak dat la.',
          'Chèche, oswa filtre pa magazen oswa etikèt, pou jwenn yon kliyan vit.',
          'Louvri yon kliyan pou rele l, voye tèks, WhatsApp oswa imèl ba li, epi ajoute nòt oswa etikèt.',
          'Voye tèks oswa imèl sèlman bay kliyan ki dakò — konsantman yo sove sou kliyan an.',
        ],
      },
    },
  },
  // ---------------------------------------------------------------- Website forms
  {
    id: 'website-forms',
    area: 'websites',
    path: '/wh',
    keywords: 'webhook flows websites forms form inbox submissions spam duplicates leads overview',
    text: {
      en: {
        title: 'Website forms',
        summary: 'Every form filled in on our websites lands in one place and becomes a lead automatically.',
        steps: [
          'Overview: leads, spam blocked, duplicates and failed steps for each website, plus anything that needs attention.',
          'Websites: add a website to get its form code, and set the phone number shown for it.',
          'Form inbox (Submissions): every form sent, newest first. Filter by website, form, status or dates; open one to see all its answers.',
          'Spam and duplicates are set aside on their own, so the team only sees real leads.',
          'Each real submission becomes a lead in Leads and is assigned to a salesperson.',
        ],
      },
      es: {
        title: 'Formularios web',
        summary: 'Cada formulario llenado en nuestros sitios web llega a un solo lugar y se convierte en prospecto automáticamente.',
        steps: [
          'Resumen: prospectos, spam bloqueado, duplicados y pasos fallidos de cada sitio web, y lo que necesita atención.',
          'Sitios web: agrega un sitio para obtener el código de su formulario y elige el teléfono que se muestra.',
          'Bandeja de formularios (Envíos): todos los formularios enviados, del más nuevo al más viejo. Filtra por sitio, formulario, estado o fechas; abre uno para ver todas sus respuestas.',
          'El spam y los duplicados se apartan solos, así el equipo solo ve prospectos reales.',
          'Cada envío real se convierte en un prospecto en Prospectos y se asigna a un vendedor.',
        ],
      },
      fr: {
        title: 'Formulaires web',
        summary: 'Chaque formulaire rempli sur nos sites arrive au même endroit et devient automatiquement un prospect.',
        steps: [
          'Vue d’ensemble : prospects, spam bloqué, doublons et étapes en échec pour chaque site, plus ce qui demande votre attention.',
          'Sites web : ajoutez un site pour obtenir le code de son formulaire et choisissez le numéro affiché.',
          'Boîte des formulaires (Envois) : tous les formulaires reçus, du plus récent au plus ancien. Filtrez par site, formulaire, statut ou dates ; ouvrez-en un pour voir toutes les réponses.',
          'Le spam et les doublons sont mis de côté, l’équipe ne voit que les vrais prospects.',
          'Chaque vrai envoi devient un prospect dans Prospects et est attribué à un vendeur.',
        ],
      },
      ht: {
        title: 'Fòm sit entènèt',
        summary: 'Chak fòm moun ranpli sou sit entènèt nou yo rive nan yon sèl kote epi li vin yon kliyan potansyèl otomatikman.',
        steps: [
          'Apèsi: kliyan, spam yo bloke, doub ak etap ki echwe pou chak sit, plis sa ki bezwen atansyon.',
          'Sit entènèt: ajoute yon sit pou jwenn kòd fòm li, epi mete nimewo telefòn ki parèt pou li.',
          'Bwat fòm yo (Soumisyon): tout fòm yo voye, sa ki pi nouvo an premye. Filtre pa sit, fòm, eta oswa dat; louvri youn pou wè tout repons li.',
          'Spam ak doub yo mete sou kote poukont yo, konsa ekip la wè sèlman vrè kliyan.',
          'Chak vrè soumisyon vin yon kliyan potansyèl nan Kliyan potansyèl epi li bay yon vandè.',
        ],
      },
    },
  },
  {
    id: 'google-sheets',
    area: 'websites',
    path: '/wh/settings',
    keywords: 'google sheets spreadsheet share it for me fix old rows robot connect analytics leads sheet',
    text: {
      en: {
        title: 'Google Sheets connection',
        summary: 'Website leads are also written to a Google Sheet. TIGON IOT uses its own Google robot account, so the connection never expires.',
        steps: [
          'Step 1: in Webhook Flows → Settings, paste the link of your leads Google Sheet and the tab name, then tap Save.',
          'Step 2: share the sheet with the robot address as an Editor — or tap Share it for me and sign in with the Google account that owns the sheet. It only adds the robot once; nothing is saved.',
          'Step 3: tap Check & connect. It switches on the Sheets API if needed, tests every sheet and re-sends rows that failed before.',
          'If a sheet has old rows in the wrong columns, tap Fix old rows next to it: rows are moved under the right headings and repeated rows for the same lead are removed. Other rows are not touched.',
          'If Google refuses for a while, no rows are lost — they are kept and retried every hour.',
        ],
      },
      es: {
        title: 'Conexión con Google Sheets',
        summary: 'Los prospectos web también se escriben en una hoja de Google. TIGON IOT usa su propia cuenta robot de Google, así la conexión nunca vence.',
        steps: [
          'Paso 1: en Webhook Flows → Ajustes, pega el enlace de tu hoja de prospectos y el nombre de la pestaña, y toca Guardar.',
          'Paso 2: comparte la hoja con la dirección del robot como Editor, o toca Share it for me (Compártelo por mí) e inicia sesión con la cuenta de Google dueña de la hoja. Solo agrega al robot una vez; no se guarda nada.',
          'Paso 3: toca Check & connect (Revisar y conectar). Activa la API de Sheets si hace falta, prueba cada hoja y vuelve a enviar las filas que fallaron.',
          'Si una hoja tiene filas viejas en columnas equivocadas, toca Fix old rows (Arreglar filas viejas): las filas se mueven bajo los títulos correctos y se quitan las repetidas del mismo prospecto. Las demás filas no se tocan.',
          'Si Google rechaza por un tiempo, no se pierde ninguna fila: se guardan y se reintentan cada hora.',
        ],
      },
      fr: {
        title: 'Connexion Google Sheets',
        summary: 'Les prospects web sont aussi écrits dans une feuille Google. TIGON IOT utilise son propre compte robot Google : la connexion n’expire jamais.',
        steps: [
          'Étape 1 : dans Webhook Flows → Réglages, collez le lien de votre feuille de prospects et le nom de l’onglet, puis touchez Enregistrer.',
          'Étape 2 : partagez la feuille avec l’adresse du robot en tant qu’Éditeur, ou touchez Share it for me (Partager pour moi) et connectez-vous avec le compte Google propriétaire. Le robot n’est ajouté qu’une fois ; rien n’est enregistré.',
          'Étape 3 : touchez Check & connect (Vérifier et connecter). Cela active l’API Sheets si besoin, teste chaque feuille et renvoie les lignes en échec.',
          'Si une feuille a d’anciennes lignes dans les mauvaises colonnes, touchez Fix old rows (Corriger les anciennes lignes) : elles sont replacées sous les bons titres et les doublons d’un même prospect sont retirés. Les autres lignes ne changent pas.',
          'Si Google refuse un moment, aucune ligne n’est perdue : elles sont gardées et renvoyées toutes les heures.',
        ],
      },
      ht: {
        title: 'Koneksyon Google Sheets',
        summary: 'Kliyan ki soti sou sit entènèt yo ekri nan yon fèy Google tou. TIGON IOT sèvi ak pwòp kont robo Google li, kidonk koneksyon an pa janm ekspire.',
        steps: [
          'Etap 1: nan Webhook Flows → Paramèt, kole lyen fèy Google kliyan yo ak non onglè a, epi peze Anrejistre.',
          'Etap 2: pataje fèy la ak adrès robo a kòm Editor — oswa peze Share it for me (Pataje l pou mwen) epi konekte ak kont Google ki posede fèy la. Li ajoute robo a yon sèl fwa; anyen pa sove.',
          'Etap 3: peze Check & connect (Tcheke epi konekte). Li limen API Sheets la si sa nesesè, li teste chak fèy epi li voye ankò liy ki te echwe yo.',
          'Si yon fèy gen vye liy nan move kolòn, peze Fix old rows (Ranje vye liy yo): liy yo deplase anba bon tit yo epi liy ki repete pou menm kliyan an retire. Lòt liy yo pa chanje.',
          'Si Google refize pou yon ti tan, pa gen liy ki pèdi — yo kenbe yo epi yo eseye ankò chak èdtan.',
        ],
      },
    },
  },
  // ---------------------------------------------------------------- Team & admin
  {
    id: 'phones-texting',
    area: 'admin',
    path: '/devices',
    keywords: 'phones devices texting phone sms permission android store phone online notification access',
    text: {
      en: {
        title: 'Phones & the store texting phone',
        summary: 'Pair your phone to get alerts, and set up one Android phone per store to send the store’s texts.',
        steps: [
          'Devices lists every paired phone and whether it is online. See “Pair a phone” to add one.',
          'Texting phone: on the store’s Android phone, open the TIGON IOT app → Dashboard → This Device → Make this the texting phone, and pick the store.',
          'When Android asks, choose Allow for SMS and turn on notification access for TIGON IOT.',
          'Keep the texting phone charged, on Wi-Fi or data, with the app installed. The Texts page shows if it is online.',
          'Admins can also pick each store’s texting phone in Sell more settings → Texting.',
        ],
      },
      es: {
        title: 'Teléfonos y el teléfono de mensajes de la tienda',
        summary: 'Vincula tu teléfono para recibir avisos y configura un teléfono Android por tienda para enviar los mensajes de la tienda.',
        steps: [
          'Dispositivos muestra cada teléfono vinculado y si está en línea. Mira “Vincular un teléfono” para agregar uno.',
          'Teléfono de mensajes: en el teléfono Android de la tienda, abre la app TIGON IOT → Panel → Este dispositivo → Usar como teléfono de mensajes, y elige la tienda.',
          'Cuando Android pregunte, elige Permitir para SMS y activa el acceso a notificaciones de TIGON IOT.',
          'Mantén el teléfono cargado, con Wi-Fi o datos y con la app instalada. La página Mensajes muestra si está en línea.',
          'Los administradores también pueden elegir el teléfono de cada tienda en Ajustes de Vender más → Mensajes.',
        ],
      },
      fr: {
        title: 'Téléphones et téléphone SMS du magasin',
        summary: 'Associez votre téléphone pour recevoir les alertes et configurez un téléphone Android par magasin pour envoyer les SMS du magasin.',
        steps: [
          'Appareils liste chaque téléphone associé et s’il est en ligne. Voir « Associer un téléphone » pour en ajouter un.',
          'Téléphone SMS : sur le téléphone Android du magasin, ouvrez l’app TIGON IOT → Tableau de bord → Cet appareil → En faire le téléphone SMS, et choisissez le magasin.',
          'Quand Android le demande, choisissez Autoriser pour les SMS et activez l’accès aux notifications pour TIGON IOT.',
          'Gardez ce téléphone chargé, en Wi-Fi ou données, avec l’app installée. La page SMS indique s’il est en ligne.',
          'Les admins peuvent aussi choisir le téléphone SMS de chaque magasin dans Réglages Vendre plus → SMS.',
        ],
      },
      ht: {
        title: 'Telefòn ak telefòn tèks magazen an',
        summary: 'Konekte telefòn ou pou resevwa alèt, epi mete yon telefòn Android pou chak magazen pou voye tèks magazen an.',
        steps: [
          'Aparèy yo montre chak telefòn ki konekte ak si li sou liy. Gade “Konekte yon telefòn” pou ajoute youn.',
          'Telefòn tèks: sou telefòn Android magazen an, louvri app TIGON IOT → Dashboard → Aparèy sa a → Fè l telefòn tèks la, epi chwazi magazen an.',
          'Lè Android mande, chwazi Pèmèt pou SMS epi limen aksè notifikasyon pou TIGON IOT.',
          'Kenbe telefòn tèks la chaje, sou Wi-Fi oswa done, ak app la enstale. Paj Tèks la montre si li sou liy.',
          'Admin yo ka chwazi telefòn tèks chak magazen tou nan Paramèt Vann plis → Tèks.',
        ],
      },
    },
  },
  {
    id: 'users-approvals',
    area: 'admin',
    path: '/mp/accounts',
    keywords: 'users accounts approve approval new user sign up verify email role admin manager member turn off',
    text: {
      en: {
        title: 'Users & approvals',
        summary: 'New people sign up with their @tigongolfcarts.com email, verify it, and wait for an admin to approve them.',
        steps: [
          'The new person registers with their @tigongolfcarts.com email and opens the link in the verification email.',
          'They see “waiting for approval” until an admin approves them. Tip: tell your manager when you sign up.',
          'Admins: open Accounts. People waiting are listed at the top — tap Approve only for people you know work at TIGON.',
          'Set each person’s role (Member, Manager or Admin) and store.',
          'Someone left? Turn their account off. They can no longer sign in; their history stays.',
        ],
      },
      es: {
        title: 'Usuarios y aprobaciones',
        summary: 'Las personas nuevas se registran con su correo @tigongolfcarts.com, lo verifican y esperan a que un administrador las apruebe.',
        steps: [
          'La persona nueva se registra con su correo @tigongolfcarts.com y abre el enlace del correo de verificación.',
          'Verá “esperando aprobación” hasta que un administrador la apruebe. Consejo: avisa a tu gerente cuando te registres.',
          'Administradores: abran Cuentas. Las personas en espera aparecen arriba; toquen Aprobar solo si saben que trabajan en TIGON.',
          'Elige el rol de cada persona (Miembro, Gerente o Administrador) y su tienda.',
          '¿Alguien se fue? Desactiva su cuenta. Ya no podrá iniciar sesión; su historial se conserva.',
        ],
      },
      fr: {
        title: 'Utilisateurs et approbations',
        summary: 'Les nouveaux s’inscrivent avec leur e-mail @tigongolfcarts.com, le vérifient, puis attendent qu’un admin les approuve.',
        steps: [
          'La nouvelle personne s’inscrit avec son e-mail @tigongolfcarts.com et ouvre le lien de l’e-mail de vérification.',
          'Elle voit « en attente d’approbation » jusqu’à ce qu’un admin l’approuve. Astuce : prévenez votre responsable quand vous vous inscrivez.',
          'Admins : ouvrez Comptes. Les personnes en attente sont en haut ; touchez Approuver seulement pour les personnes qui travaillent chez TIGON.',
          'Choisissez le rôle de chacun (Membre, Responsable ou Admin) et son magasin.',
          'Quelqu’un est parti ? Désactivez son compte. Il ne peut plus se connecter ; son historique est conservé.',
        ],
      },
      ht: {
        title: 'Itilizatè ak apwobasyon',
        summary: 'Nouvo moun yo enskri ak imèl @tigongolfcarts.com yo, yo verifye l, epi yo tann yon admin apwouve yo.',
        steps: [
          'Nouvo moun lan enskri ak imèl @tigongolfcarts.com li epi li louvri lyen ki nan imèl verifikasyon an.',
          'Li wè “ap tann apwobasyon” jiskaske yon admin apwouve l. Konsèy: di manadjè ou lè ou enskri.',
          'Admin: louvri Kont yo. Moun k ap tann yo parèt anlè — peze Apwouve sèlman pou moun ou konnen ki travay nan TIGON.',
          'Chwazi wòl chak moun (Manm, Manadjè oswa Admin) ak magazen li.',
          'Yon moun ale? Fèmen kont li. Li pa ka konekte ankò; istwa li rete.',
        ],
      },
    },
  },
  {
    id: 'settings',
    area: 'admin',
    path: '/settings',
    keywords: 'settings preferences language theme dark mode notifications sell more settings admin',
    text: {
      en: {
        title: 'Settings',
        summary: 'Your own preferences, plus the settings admins use to run the app for every store.',
        steps: [
          'Your preferences: language, light or dark look and large text are in the Help center (Display & language) and the account menu.',
          'Settings: your account and phone alerts.',
          'Sell more settings (admins): Leads & speed, Texting, Quotes, booking & trade-ins, Inventory, Reviews & referrals.',
          'MP Assistant settings (admins) and Webhook Flows → Settings hold the rest, like the Google Sheets connection.',
          'Not sure where something is? Use Search at the top and type its name.',
        ],
      },
      es: {
        title: 'Ajustes',
        summary: 'Tus preferencias, y los ajustes que usan los administradores para manejar la app en todas las tiendas.',
        steps: [
          'Tus preferencias: idioma, aspecto claro u oscuro y texto grande están en el Centro de ayuda (Pantalla e idioma) y en el menú de tu cuenta.',
          'Ajustes: tu cuenta y los avisos del teléfono.',
          'Ajustes de Vender más (administradores): Prospectos y rapidez, Mensajes, Cotizaciones, reservas e intercambios, Inventario, Reseñas y referidos.',
          'Los ajustes de MP Assistant (administradores) y Webhook Flows → Ajustes tienen lo demás, como la conexión con Google Sheets.',
          '¿No sabes dónde está algo? Usa Buscar arriba y escribe su nombre.',
        ],
      },
      fr: {
        title: 'Réglages',
        summary: 'Vos préférences, plus les réglages que les admins utilisent pour gérer l’app dans tous les magasins.',
        steps: [
          'Vos préférences : la langue, l’apparence claire ou sombre et le texte agrandi sont dans le Centre d’aide (Affichage et langue) et le menu du compte.',
          'Réglages : votre compte et les alertes du téléphone.',
          'Réglages Vendre plus (admins) : Prospects et rapidité, SMS, Devis, réservations et reprises, Stock, Avis et parrainages.',
          'Les réglages MP Assistant (admins) et Webhook Flows → Réglages contiennent le reste, comme la connexion Google Sheets.',
          'Vous ne savez pas où trouver quelque chose ? Utilisez Rechercher en haut et tapez son nom.',
        ],
      },
      ht: {
        title: 'Paramèt',
        summary: 'Preferans pa ou, plis paramèt admin yo itilize pou fè app la mache pou tout magazen yo.',
        steps: [
          'Preferans ou: lang, aparans klè oswa fonse ak gwo tèks yo nan Sant èd la (Ekran ak lang) ak nan meni kont ou.',
          'Paramèt: kont ou ak alèt telefòn ou.',
          'Paramèt Vann plis (admin): Kliyan ak vitès, Tèks, Kotasyon, rezèvasyon ak echanj, Envantè, Revi ak referans.',
          'Paramèt MP Assistant (admin) ak Webhook Flows → Paramèt gen rès la, tankou koneksyon Google Sheets la.',
          'Ou pa konnen ki kote yon bagay ye? Sèvi ak Chèche anlè a epi tape non li.',
        ],
      },
    },
  },
];
