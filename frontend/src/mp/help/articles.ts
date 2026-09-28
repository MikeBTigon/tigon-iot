/**
 * Help center articles, written in all four app languages.
 * NOTE: the Spanish, French and Haitian Creole texts are machine-assisted — have native speakers review them.
 * Link to an article with `/mp/help?a=<id>` or show it inline with <HelpTip article="<id>" />.
 */
import type { Language } from '../growthTypes';

export type HelpArticleId =
  | 'post-3-taps'
  | 'pair-phone'
  | 'auto-post'
  | 'share-kit'
  | 'leads'
  | 'snap-to-list'
  | 'troubleshooting'
  | 'offline';

export interface ArticleText {
  title: string;
  /** One or two sentences (also used as the HelpTip tooltip). */
  summary: string;
  /** Numbered steps or Q&A lines. */
  steps: string[];
}

export interface HelpArticle {
  id: HelpArticleId;
  /** Page the article is about (shown as an "Open" button). */
  path?: string;
  /** Extra search words (English; the translated text is searched too). */
  keywords: string;
  text: Record<Language, ArticleText>;
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: 'post-3-taps',
    path: '/mp',
    keywords: 'post marketplace facebook prepare publish copy photos',
    text: {
      en: {
        title: 'Post a cart in 3 taps',
        summary: 'Open a cart, tap Prepare listing, then: save photos, copy & open Marketplace, and mark it published.',
        steps: [
          'On Home, pick a suggested cart (or search for one) and tap Prepare listing.',
          'Tap 1 — Save photos to this phone. On a computer the photos download instead.',
          'Tap 2 — Copy listing & open Marketplace. The description is copied; paste it into Facebook, add the photos and tap Publish.',
          'Tap 3 — I published it. Choose the Facebook account(s) you used. The cart is marked posted and the queue item is completed.',
          'Couldn’t post? Tap “Couldn’t post it” and give a reason so your manager knows.',
        ],
      },
      es: {
        title: 'Publica un carrito en 3 toques',
        summary: 'Abre un carrito, toca Preparar anuncio y luego: guarda las fotos, copia y abre Marketplace, y márcalo como publicado.',
        steps: [
          'En Inicio, elige un carrito sugerido (o búscalo) y toca Preparar anuncio.',
          'Toque 1 — Guardar fotos en este teléfono. En una computadora, las fotos se descargan.',
          'Toque 2 — Copiar anuncio y abrir Marketplace. La descripción se copia; pégala en Facebook, agrega las fotos y toca Publicar.',
          'Toque 3 — Ya lo publiqué. Elige las cuentas de Facebook que usaste. El carrito queda como publicado y el trabajo de la cola se completa.',
          '¿No pudiste publicar? Toca “No pude publicarlo” y escribe el motivo para que tu gerente lo sepa.',
        ],
      },
      fr: {
        title: 'Publier une voiturette en 3 touches',
        summary: 'Ouvrez une voiturette, touchez Préparer l’annonce, puis : enregistrez les photos, copiez et ouvrez Marketplace, et marquez-la publiée.',
        steps: [
          'Sur l’Accueil, choisissez une voiturette suggérée (ou cherchez-la) et touchez Préparer l’annonce.',
          'Touche 1 — Enregistrer les photos sur ce téléphone. Sur un ordinateur, les photos sont téléchargées.',
          'Touche 2 — Copier l’annonce et ouvrir Marketplace. La description est copiée ; collez-la dans Facebook, ajoutez les photos et touchez Publier.',
          'Touche 3 — Je l’ai publiée. Choisissez le ou les comptes Facebook utilisés. La voiturette est marquée publiée et la tâche de la file est terminée.',
          'Publication impossible ? Touchez « Je n’ai pas pu la publier » et indiquez la raison pour prévenir votre responsable.',
        ],
      },
      ht: {
        title: 'Pibliye yon kabwèt an 3 kou',
        summary: 'Louvri yon kabwèt, peze Prepare anons lan, epi: anrejistre foto yo, kopye epi louvri Marketplace, epi make li pibliye.',
        steps: [
          'Nan Akèy, chwazi yon kabwèt yo sijere (oswa chèche li) epi peze Prepare anons lan.',
          'Kou 1 — Anrejistre foto yo sou telefòn sa a. Sou yon òdinatè, foto yo ap telechaje.',
          'Kou 2 — Kopye anons lan epi louvri Marketplace. Deskripsyon an kopye; kole li nan Facebook, mete foto yo epi peze Publish.',
          'Kou 3 — Mwen pibliye li. Chwazi kont Facebook ou te itilize yo. Kabwèt la make kòm pibliye epi travay nan lis atant lan fini.',
          'Ou pa t kapab pibliye? Peze “Mwen pa t kapab pibliye li” epi bay rezon an pou manadjè ou konnen.',
        ],
      },
    },
  },
  {
    id: 'pair-phone',
    path: '/devices',
    keywords: 'pair phone qr code app sign in iphone android install',
    text: {
      en: {
        title: 'Pair a phone',
        summary: 'Scan a QR code from Devices → Pair a phone with the TIGON IOT app. The phone signs in as you, no password needed.',
        steps: [
          'Install the TIGON IOT app on the phone (Download App in the menu has the links).',
          'On a computer, open Devices and tap Pair a phone. A QR code and an 8-character code appear (valid 10 minutes, one use).',
          'On the phone’s sign-in screen tap Scan pairing QR code, or type the code.',
          'The phone signs in as you and shows up in your Devices list. Managers can pair a phone for a teammate.',
        ],
      },
      es: {
        title: 'Vincular un teléfono',
        summary: 'Escanea un código QR de Dispositivos → Vincular un teléfono con la app TIGON IOT. El teléfono inicia sesión como tú, sin contraseña.',
        steps: [
          'Instala la app TIGON IOT en el teléfono (Descargar la app, en el menú, tiene los enlaces).',
          'En una computadora, abre Dispositivos y toca Vincular un teléfono. Aparecen un código QR y un código de 8 caracteres (válido 10 minutos, un solo uso).',
          'En la pantalla de inicio de sesión del teléfono toca Escanear código QR de vinculación, o escribe el código.',
          'El teléfono inicia sesión como tú y aparece en tu lista de Dispositivos. Los gerentes pueden vincular un teléfono para un compañero.',
        ],
      },
      fr: {
        title: 'Associer un téléphone',
        summary: 'Scannez un code QR depuis Appareils → Associer un téléphone avec l’app TIGON IOT. Le téléphone se connecte à votre nom, sans mot de passe.',
        steps: [
          'Installez l’app TIGON IOT sur le téléphone (Télécharger l’app, dans le menu, donne les liens).',
          'Sur un ordinateur, ouvrez Appareils et touchez Associer un téléphone. Un code QR et un code de 8 caractères s’affichent (valables 10 minutes, une seule fois).',
          'Sur l’écran de connexion du téléphone, touchez Scanner le code QR, ou tapez le code.',
          'Le téléphone se connecte à votre nom et apparaît dans vos Appareils. Les responsables peuvent associer un téléphone pour un collègue.',
        ],
      },
      ht: {
        title: 'Konekte yon telefòn',
        summary: 'Eskane yon kòd QR nan Aparèy → Konekte yon telefòn ak app TIGON IOT la. Telefòn nan konekte sou non ou, san modpas.',
        steps: [
          'Enstale app TIGON IOT la sou telefòn nan (Telechaje app la, nan meni an, gen lyen yo).',
          'Sou yon òdinatè, louvri Aparèy epi peze Konekte yon telefòn. Yon kòd QR ak yon kòd 8 karaktè parèt (li bon pou 10 minit, yon sèl fwa).',
          'Sou ekran koneksyon telefòn nan, peze Eskane kòd QR la, oswa tape kòd la.',
          'Telefòn nan konekte sou non ou epi li parèt nan lis Aparèy ou. Manadjè yo ka konekte yon telefòn pou yon kòlèg.',
        ],
      },
    },
  },
  {
    id: 'auto-post',
    path: '/mp/queue',
    keywords: 'auto post queue schedule push assign send later',
    text: {
      en: {
        title: 'Auto Post & the queue',
        summary: 'Auto Post sends a “ready to post” job to a phone now or at a scheduled time. Track every job on the Queue page.',
        steps: [
          'On a cart page tap Auto Post. Pick who posts it (managers can pick anyone), which phone, the Facebook account and the listing variation.',
          'Choose Send now or Schedule a date and time.',
          'The phone gets a push “Ready to post”. Tapping it opens the Prepare screen — then it’s the usual 3 taps.',
          'Unopened jobs are re-sent every 30 minutes, up to 3 times, then marked failed and your manager is alerted.',
          'Queue page: Mine / Team, filter Waiting / Posted / Failed, and Post now, retry or cancel.',
        ],
      },
      es: {
        title: 'Auto Post y la cola',
        summary: 'Auto Post envía un trabajo “listo para publicar” a un teléfono ahora o a una hora programada. Sigue cada trabajo en la página Cola.',
        steps: [
          'En la página de un carrito toca Auto Post. Elige quién publica (los gerentes pueden elegir a cualquiera), qué teléfono, la cuenta de Facebook y la variación del anuncio.',
          'Elige Enviar ahora o Programar una fecha y hora.',
          'El teléfono recibe la alerta “Listo para publicar”. Al tocarla se abre la pantalla Preparar; luego son los 3 toques de siempre.',
          'Los trabajos sin abrir se reenvían cada 30 minutos, hasta 3 veces; después se marcan como fallidos y se avisa a tu gerente.',
          'Página Cola: Míos / Equipo, filtro En espera / Publicados / Fallidos, y Publicar ahora, reintentar o cancelar.',
        ],
      },
      fr: {
        title: 'Auto Post et la file',
        summary: 'Auto Post envoie une tâche « prête à publier » à un téléphone, tout de suite ou à une heure prévue. Suivez chaque tâche sur la page File.',
        steps: [
          'Sur la page d’une voiturette, touchez Auto Post. Choisissez qui publie (les responsables peuvent choisir n’importe qui), le téléphone, le compte Facebook et la variante d’annonce.',
          'Choisissez Envoyer maintenant ou Planifier une date et une heure.',
          'Le téléphone reçoit l’alerte « Prête à publier ». La toucher ouvre l’écran Préparer — ensuite, ce sont les 3 touches habituelles.',
          'Les tâches non ouvertes sont renvoyées toutes les 30 minutes, jusqu’à 3 fois, puis marquées en échec et votre responsable est prévenu.',
          'Page File : Les miennes / Équipe, filtre En attente / Publiées / Échouées, et Publier maintenant, réessayer ou annuler.',
        ],
      },
      ht: {
        title: 'Auto Post ak lis atant lan',
        summary: 'Auto Post voye yon travay “pare pou pibliye” sou yon telefòn kounye a oswa a yon lè ou chwazi. Swiv chak travay nan paj Lis atant lan.',
        steps: [
          'Sou paj yon kabwèt, peze Auto Post. Chwazi kiyès ki pibliye (manadjè yo ka chwazi nenpòt moun), ki telefòn, kont Facebook la ak vèsyon anons lan.',
          'Chwazi Voye kounye a oswa Pwograme yon dat ak yon lè.',
          'Telefòn nan resevwa alèt “Pare pou pibliye”. Lè ou peze li, ekran Prepare a louvri — apre sa se 3 kou abityèl yo.',
          'Travay ki pa louvri yo voye ankò chak 30 minit, jiska 3 fwa; apre sa yo make kòm echwe epi manadjè ou resevwa yon alèt.',
          'Paj Lis atant: Pa m / Ekip, filtre An atant / Pibliye / Echwe, epi Pibliye kounye a, eseye ankò oswa anile.',
        ],
      },
    },
  },
  {
    id: 'share-kit',
    path: '/mp/storefront',
    keywords: 'share kit storefront link qr whatsapp instagram sms tracked',
    text: {
      en: {
        title: 'Share Kit & your storefront',
        summary: 'Share any cart with a tracked link, QR code or ready-made graphic, and send people to your own storefront page.',
        steps: [
          'On a cart page open Share. Pick where you’re sharing (WhatsApp, Instagram, SMS, email…) — each gets its own tracked short link.',
          'Use the QR code or the ready-made graphic for printouts and stories.',
          'Storefront: set a title, tagline and phone, choose stores and pin favorite carts, then Publish. Your page updates itself as inventory changes.',
          'Links & A/B shows clicks per link so you can see which posts bring buyers.',
        ],
      },
      es: {
        title: 'Share Kit y tu escaparate',
        summary: 'Comparte cualquier carrito con un enlace con seguimiento, un código QR o una imagen lista, y envía a la gente a tu propia página escaparate.',
        steps: [
          'En la página de un carrito abre Compartir. Elige dónde compartes (WhatsApp, Instagram, SMS, correo…); cada uno recibe su propio enlace corto con seguimiento.',
          'Usa el código QR o la imagen lista para impresiones e historias.',
          'Escaparate: pon un título, un lema y tu teléfono, elige las tiendas y fija tus carritos favoritos; luego Publica. Tu página se actualiza sola con el inventario.',
          'Enlaces y A/B muestra los clics por enlace para ver qué publicaciones traen compradores.',
        ],
      },
      fr: {
        title: 'Share Kit et votre vitrine',
        summary: 'Partagez n’importe quelle voiturette avec un lien suivi, un code QR ou un visuel prêt à l’emploi, et envoyez les gens vers votre propre vitrine.',
        steps: [
          'Sur la page d’une voiturette, ouvrez Partager. Choisissez où vous partagez (WhatsApp, Instagram, SMS, e-mail…) — chacun reçoit son propre lien court suivi.',
          'Utilisez le code QR ou le visuel prêt à l’emploi pour les impressions et les stories.',
          'Vitrine : indiquez un titre, un slogan et votre téléphone, choisissez les magasins et épinglez vos voiturettes préférées, puis Publiez. La page se met à jour avec le stock.',
          'Liens et A/B montre les clics par lien pour voir quelles publications amènent des acheteurs.',
        ],
      },
      ht: {
        title: 'Share Kit ak vitrin ou',
        summary: 'Pataje nenpòt kabwèt ak yon lyen ki swiv klik yo, yon kòd QR oswa yon imaj ki tou pare, epi voye moun sou pwòp paj vitrin ou.',
        steps: [
          'Sou paj yon kabwèt, louvri Pataje. Chwazi ki kote w ap pataje (WhatsApp, Instagram, SMS, imèl…) — chak youn gen pwòp ti lyen pa li ki swiv klik yo.',
          'Sèvi ak kòd QR la oswa imaj ki tou pare a pou papye enprime ak istwa (stories).',
          'Vitrin: mete yon tit, yon ti fraz ak telefòn ou, chwazi magazen yo epi mete kabwèt ou pi renmen yo an premye, apre sa Pibliye. Paj la mete tèt li ajou ak stòk la.',
          'Lyen ak A/B montre konbyen klik chak lyen fè pou ou wè ki piblikasyon ki pote achtè.',
        ],
      },
    },
  },
  {
    id: 'leads',
    path: '/mp/leads',
    keywords: 'leads follow up crm buyer customer reminder sold lost',
    text: {
      en: {
        title: 'Leads & follow-ups',
        summary: 'Save every interested buyer as a lead, set a follow-up date, and move it to Sold or Lost.',
        steps: [
          'Leads → Add lead: name, phone or email, where they came from and the cart they asked about.',
          'Set a follow-up date — due follow-ups are listed first so nobody is forgotten.',
          'Update the status as you talk: New → Talking → Sold or Lost. Add notes after each call.',
          'You see your own leads; managers see the whole team’s.',
          'Only text or email customers who agreed to it — consent is saved on each customer.',
        ],
      },
      es: {
        title: 'Prospectos y seguimientos',
        summary: 'Guarda a cada comprador interesado como prospecto, pon una fecha de seguimiento y muévelo a Vendido o Perdido.',
        steps: [
          'Prospectos → Agregar: nombre, teléfono o correo, de dónde vino y el carrito por el que preguntó.',
          'Pon una fecha de seguimiento; los seguimientos pendientes aparecen primero para que nadie quede olvidado.',
          'Actualiza el estado mientras hablas: Nuevo → En conversación → Vendido o Perdido. Agrega notas después de cada llamada.',
          'Ves tus propios prospectos; los gerentes ven los de todo el equipo.',
          'Solo envía mensajes o correos a clientes que lo aceptaron; el consentimiento se guarda en cada cliente.',
        ],
      },
      fr: {
        title: 'Prospects et relances',
        summary: 'Enregistrez chaque acheteur intéressé comme prospect, fixez une date de relance et passez-le en Vendu ou Perdu.',
        steps: [
          'Prospects → Ajouter : nom, téléphone ou e-mail, sa provenance et la voiturette demandée.',
          'Fixez une date de relance — les relances dues s’affichent en premier pour n’oublier personne.',
          'Mettez à jour le statut au fil des échanges : Nouveau → En discussion → Vendu ou Perdu. Ajoutez des notes après chaque appel.',
          'Vous voyez vos propres prospects ; les responsables voient ceux de toute l’équipe.',
          'N’écrivez qu’aux clients qui l’ont accepté — le consentement est enregistré sur chaque client.',
        ],
      },
      ht: {
        title: 'Kliyan potansyèl ak swivi',
        summary: 'Anrejistre chak achtè ki enterese kòm kliyan potansyèl, mete yon dat pou swivi, epi make li Vann oswa Pèdi.',
        steps: [
          'Kliyan potansyèl → Ajoute: non, telefòn oswa imèl, kote li soti ak kabwèt li te mande a.',
          'Mete yon dat swivi — swivi ki rive yo parèt an premye pou pèsonn pa bliye.',
          'Chanje eta a pandan w ap pale: Nouvo → Ap pale → Vann oswa Pèdi. Ajoute nòt apre chak apèl.',
          'Ou wè pwòp kliyan potansyèl pa w; manadjè yo wè pa tout ekip la.',
          'Voye tèks oswa imèl sèlman bay kliyan ki dakò — dakò a anrejistre sou chak kliyan.',
        ],
      },
    },
  },
  {
    id: 'snap-to-list',
    path: '/mp/new',
    keywords: 'snap to list new listing photos camera create manual cart',
    text: {
      en: {
        title: 'Snap-to-list',
        summary: 'Take a few photos and fill in the basics — the app builds a ready-to-post listing for a cart that isn’t in the DMS yet.',
        steps: [
          'Open New listing (or the “New listing” quick action on the app icon).',
          'Take or pick photos: front, side, seats and dash work best.',
          'Check the details (year, make, model, color, price, store). Fill anything missing.',
          'Save. The cart appears in Browse like any other, ready for Prepare listing, Auto Post and Share.',
        ],
      },
      es: {
        title: 'Snap-to-list',
        summary: 'Toma unas fotos y llena lo básico: la app crea un anuncio listo para publicar de un carrito que aún no está en el DMS.',
        steps: [
          'Abre Nuevo anuncio (o la acción rápida “Nuevo anuncio” en el ícono de la app).',
          'Toma o elige fotos: frente, lado, asientos y tablero funcionan mejor.',
          'Revisa los datos (año, marca, modelo, color, precio, tienda). Completa lo que falte.',
          'Guarda. El carrito aparece en Explorar como cualquier otro, listo para Preparar anuncio, Auto Post y Compartir.',
        ],
      },
      fr: {
        title: 'Snap-to-list',
        summary: 'Prenez quelques photos et remplissez l’essentiel — l’app crée une annonce prête à publier pour une voiturette pas encore dans le DMS.',
        steps: [
          'Ouvrez Nouvelle annonce (ou l’action rapide « Nouvelle annonce » sur l’icône de l’app).',
          'Prenez ou choisissez des photos : avant, côté, sièges et tableau de bord donnent les meilleurs résultats.',
          'Vérifiez les détails (année, marque, modèle, couleur, prix, magasin). Complétez ce qui manque.',
          'Enregistrez. La voiturette apparaît dans Parcourir comme les autres, prête pour Préparer l’annonce, Auto Post et Partager.',
        ],
      },
      ht: {
        title: 'Snap-to-list',
        summary: 'Pran kèk foto epi ranpli enfòmasyon debaz yo — app la fè yon anons ki pare pou pibliye pou yon kabwèt ki poko nan DMS la.',
        steps: [
          'Louvri Nouvo anons (oswa aksyon rapid “Nouvo anons” sou ikòn app la).',
          'Pran oswa chwazi foto: devan, sou kote, chèz yo ak tablo a bay pi bon rezilta.',
          'Verifye detay yo (ane, mak, modèl, koulè, pri, magazen). Ranpli sa ki manke.',
          'Anrejistre. Kabwèt la parèt nan Gade tout tankou lòt yo, pare pou Prepare anons, Auto Post ak Pataje.',
        ],
      },
    },
  },
  {
    id: 'troubleshooting',
    keywords: 'troubleshooting problem push notification not arriving photos not saving pairing sign in error blocked',
    text: {
      en: {
        title: 'Troubleshooting',
        summary: 'Fixes for push alerts not arriving, photos not saving and pairing/sign-in problems.',
        steps: [
          'Push alerts not arriving: in the phone app turn alerts on (Dashboard → Alerts on this phone). In the phone’s Settings → Notifications, allow TIGON IOT. Open the app once so it can refresh its token.',
          'Still no pushes: check the phone is listed and Online in Devices. If it was revoked or moved to someone else, pair it again.',
          'Photos not saving (iPhone): when the share sheet opens, tap Save Images; the first time allow “Add Photos Only”. Check Settings → Privacy → Photos → TIGON IOT.',
          'Photos not saving (Android): allow Photos/Media for TIGON IOT in Settings → Apps. On a computer the photos go to your Downloads folder.',
          'Pairing code doesn’t work: codes last 10 minutes and work once — create a new one. Type it exactly (8 letters/numbers, the dash is optional).',
          'Paired but asked for a password: sign in with your email and password; the phone still registers. Ask an admin to finish the pairing setup.',
          'Still stuck? Use Contact support below.',
        ],
      },
      es: {
        title: 'Solución de problemas',
        summary: 'Soluciones cuando no llegan las alertas, las fotos no se guardan o hay problemas al vincular o iniciar sesión.',
        steps: [
          'No llegan las alertas: en la app del teléfono activa las alertas (Panel → Alertas en este teléfono). En Ajustes del teléfono → Notificaciones, permite TIGON IOT. Abre la app una vez para que actualice su token.',
          'Siguen sin llegar: revisa que el teléfono aparezca y esté En línea en Dispositivos. Si fue revocado o pasado a otra persona, vincúlalo otra vez.',
          'Las fotos no se guardan (iPhone): cuando se abra el menú de compartir, toca Guardar imágenes; la primera vez permite “Solo agregar fotos”. Revisa Ajustes → Privacidad → Fotos → TIGON IOT.',
          'Las fotos no se guardan (Android): permite Fotos/Multimedia para TIGON IOT en Ajustes → Aplicaciones. En una computadora las fotos van a Descargas.',
          'El código de vinculación no funciona: dura 10 minutos y sirve una vez; crea uno nuevo. Escríbelo exacto (8 letras/números, el guion es opcional).',
          'Vinculado pero pide contraseña: inicia sesión con tu correo y contraseña; el teléfono se registra igual. Pide a un administrador que termine la configuración de vinculación.',
          '¿Sigues con problemas? Usa Contactar a soporte abajo.',
        ],
      },
      fr: {
        title: 'Dépannage',
        summary: 'Solutions quand les alertes n’arrivent pas, que les photos ne s’enregistrent pas ou en cas de problème d’association ou de connexion.',
        steps: [
          'Les alertes n’arrivent pas : dans l’app du téléphone, activez les alertes (Tableau de bord → Alertes sur ce téléphone). Dans Réglages → Notifications, autorisez TIGON IOT. Ouvrez l’app une fois pour qu’elle actualise son jeton.',
          'Toujours rien : vérifiez que le téléphone figure dans Appareils et qu’il est En ligne. S’il a été révoqué ou attribué à quelqu’un d’autre, associez-le à nouveau.',
          'Les photos ne s’enregistrent pas (iPhone) : quand le menu de partage s’ouvre, touchez Enregistrer les images ; la première fois, autorisez « Ajouter des photos uniquement ». Vérifiez Réglages → Confidentialité → Photos → TIGON IOT.',
          'Les photos ne s’enregistrent pas (Android) : autorisez Photos/Médias pour TIGON IOT dans Paramètres → Applications. Sur un ordinateur, les photos vont dans Téléchargements.',
          'Le code d’association ne marche pas : il dure 10 minutes et ne sert qu’une fois — créez-en un nouveau. Tapez-le exactement (8 lettres/chiffres, le tiret est facultatif).',
          'Associé mais un mot de passe est demandé : connectez-vous avec votre e-mail et votre mot de passe ; le téléphone s’enregistre quand même. Demandez à un administrateur de finir la configuration de l’association.',
          'Toujours bloqué ? Utilisez Contacter le support ci-dessous.',
        ],
      },
      ht: {
        title: 'Rezoud pwoblèm',
        summary: 'Solisyon lè alèt yo pa rive, foto yo pa anrejistre, oswa gen pwoblèm pou konekte telefòn nan oswa pou antre.',
        steps: [
          'Alèt yo pa rive: nan app telefòn nan, aktive alèt yo (Tablo → Alèt sou telefòn sa a). Nan Paramèt telefòn nan → Notifikasyon, pèmèt TIGON IOT. Louvri app la yon fwa pou li ka mete jeton li ajou.',
          'Toujou pa gen alèt: verifye telefòn nan nan lis Aparèy yo epi li Sou liy. Si yo te revoke li oswa bay yon lòt moun li, konekte li ankò.',
          'Foto yo pa anrejistre (iPhone): lè meni pataje a louvri, peze Save Images; premye fwa a, pèmèt “Add Photos Only”. Gade Paramèt → Privacy → Photos → TIGON IOT.',
          'Foto yo pa anrejistre (Android): pèmèt Foto/Medya pou TIGON IOT nan Paramèt → Apps. Sou yon òdinatè, foto yo ale nan dosye Downloads.',
          'Kòd pou konekte a pa mache: li dire 10 minit epi li mache yon sèl fwa — fè yon lòt. Tape li egzakteman (8 lèt/chif, tirè a pa obligatwa).',
          'Telefòn nan konekte men li mande modpas: antre ak imèl ou ak modpas ou; telefòn nan ap anrejistre kanmenm. Mande yon administratè pou fini konfigirasyon an.',
          'Ou toujou bloke? Sèvi ak Kontakte sipò anba a.',
        ],
      },
    },
  },
  {
    id: 'offline',
    keywords: 'offline no internet sync connection signal',
    text: {
      en: {
        title: 'Working offline',
        summary: 'Pages you’ve opened keep working without signal. Changes are saved on the device and sync when you’re back online.',
        steps: [
          'A banner at the top tells you when you’re offline.',
          'Carts, photos and lists you already opened still show.',
          'Changes you make (status updates, notes, marking posted) are kept and sent automatically when the connection returns.',
          'Marketplace, pairing and AI features need a connection.',
        ],
      },
      es: {
        title: 'Trabajar sin conexión',
        summary: 'Las páginas que ya abriste siguen funcionando sin señal. Los cambios se guardan en el dispositivo y se sincronizan al volver la conexión.',
        steps: [
          'Un aviso arriba te indica cuando estás sin conexión.',
          'Los carritos, fotos y listas que ya abriste se siguen viendo.',
          'Los cambios que hagas (estados, notas, marcar como publicado) se guardan y se envían solos cuando vuelve la conexión.',
          'Marketplace, la vinculación y las funciones de IA necesitan conexión.',
        ],
      },
      fr: {
        title: 'Travailler hors ligne',
        summary: 'Les pages déjà ouvertes fonctionnent sans réseau. Les modifications sont gardées sur l’appareil et synchronisées au retour de la connexion.',
        steps: [
          'Un bandeau en haut vous indique que vous êtes hors ligne.',
          'Les voiturettes, photos et listes déjà ouvertes restent visibles.',
          'Vos modifications (statuts, notes, marquer comme publiée) sont conservées et envoyées automatiquement au retour de la connexion.',
          'Marketplace, l’association et les fonctions d’IA nécessitent une connexion.',
        ],
      },
      ht: {
        title: 'Travay san entènèt',
        summary: 'Paj ou te deja louvri yo kontinye mache san siyal. Chanjman yo rete sou aparèy la epi yo senkronize lè entènèt la tounen.',
        steps: [
          'Yon bandwòl anlè a di ou lè ou pa konekte.',
          'Kabwèt, foto ak lis ou te deja louvri yo toujou parèt.',
          'Chanjman ou fè yo (eta, nòt, make pibliye) rete anrejistre epi yo voye otomatikman lè koneksyon an tounen.',
          'Marketplace, koneksyon telefòn ak fonksyon IA yo bezwen entènèt.',
        ],
      },
    },
  },
];

/** Article text in a language (English fallback). */
export const articleText = (a: HelpArticle, lang: Language): ArticleText => a.text[lang] || a.text.en;

export const findArticle = (id: string | null | undefined) => HELP_ARTICLES.find((a) => a.id === id);

/** Company support contact (change here to update the Help center and support buttons). */
export const SUPPORT = {
  phoneDisplay: '1-844-844-6638',
  phoneE164: '+18448446638',
  email: 'support@tigongolfcarts.com',
};
