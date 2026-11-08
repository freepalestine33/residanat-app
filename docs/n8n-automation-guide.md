# Automatisation n8n & Génération IA de Cours Résidanat (PDF & QCM)

Ce guide explique comment transformer automatiquement n'importe quel fichier PDF de cours ou de QCM (par exemple **« Boiterie chez l'enfant »**) en un cours interactif complet (fiches mémo, QCM et Vrai/Faux) dans votre application Résidanat.

---

## 2 Méthodes disponibles

1. **Directement dans l'application (Recommandé pour les révisions quotidiennes)** :
   - Rendez-vous sur la page **Bibliothèque** (`/#/lectures`).
   - Cliquez sur **« ✨ Générer un cours par IA (PDF) »** ou sur **« Créer avec l'IA »** sous un cours du programme (comme l'item 11 *Boiterie chez l'enfant*).
   - Choisissez votre fournisseur d'IA :
     - **Google Gemini (Gratuit / Recommandé)** : Obtenez une clé gratuite en 30 secondes sans carte bancaire sur [Google AI Studio](https://aistudio.google.com/app/apikey).
     - **OpenAI (GPT-4o)** : Nécessite des crédits payés sur platform.openai.com.
   - Déposez votre PDF ou collez votre texte.
   - L'extraction du texte, l'appel IA et la validation médicale s'exécutent en direct.
   - Prévisualisez les cartes, QCM et Vrai/Faux générés, puis cliquez sur **« Ajouter à mes cours »**.

2. **Via n8n (Automatisation continue par webhook / dossier surveillé)** :
   - Parfait si vous souhaitez automatiser l'import dès qu'un PDF est déposé dans un dossier Google Drive, Dropbox, un canal Telegram ou via un Webhook HTTP.
   - Le workflow extrait le texte, appelle Gemini (ou OpenAI GPT-4o) avec le schéma médical strict, et pousse le cours interactif directement dans l'API de votre application Résidanat.

---

## Obtenir une clé API Google Gemini gratuite

1. Rendez-vous sur [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Connectez-vous avec votre compte Google.
3. Cliquez sur **« Create API key »** (ou « Créer une clé API »).
4. Copiez la clé commençant par `AIzaSy...`.
5. Collez-la directement dans le modal de l'application ou dans votre fichier `.env.local` sous `GEMINI_API_KEY=AIzaSy...`.
6. Cochez **« Mémoriser la clé dans ce navigateur »** pour ne plus avoir à la ressaisir.

> [!NOTE]
> Le palier gratuit de Google Gemini offre jusqu'à 15 requêtes par minute et une fenêtre de contexte de 1 000 000 de tokens, ce qui permet de traiter des polycopiés et livres de QCM entiers sans frais.

---

## Configuration du Workflow n8n

### 1. Importer le workflow dans n8n
1. Ouvrez votre instance n8n.
2. Créez un nouveau workflow ou cliquez sur **Import from file...**.
3. Sélectionnez le fichier [`n8n/residanat-mcq-to-interactive-lecture.json`](../n8n/residanat-mcq-to-interactive-lecture.json).

### 2. Configurer les variables d'environnement & identifiants
Dans votre instance n8n ou votre fichier `.env` :

- **Clé API Gemini ou OpenAI** :
  - Pour Gemini : passez le paramètre `x-goog-api-key: VOTRE_CLE_GEMINI` dans le header.
  - Pour OpenAI : créez un identifiant HTTP Header Auth nommé `Authorization: Bearer sk-...`.
- **Variables d'environnement n8n** :
  - `RESIDANAT_APP_URL` : URL de votre application (ex: `http://localhost:5173` ou votre URL Netlify / Vercel en production).
  - `N8N_WEBHOOK_SECRET` : Clé secrète partagée définie dans le fichier `.env.local` de l'application (par défaut `residanat_secret_token`).

### 3. Tester le workflow avec curl

Pour convertir un PDF de QCM (ex: `boiterie_enfant_qcm.pdf`) en cours interactif :

```bash
curl -X POST "http://localhost:5678/webhook/residanat-lecture-upload?otr=11&name=Boiterie+chez+l'enfant" \
  -H "Content-Type: multipart/form-data" \
  -F "data=@boiterie_enfant_qcm.pdf"
```

Le workflow effectuera :
1. Réception du PDF.
2. Extraction de toutes les pages de texte.
3. Appel à Gemini 1.5 Flash (ou OpenAI GPT-4o) avec le prompt médical résidanat.
4. Validation du format `Lecture` (schema: 1, keys, contrasts, cards, quiz, vf).
5. Envoi vers l'endpoint `/api/webhooks/n8n-lecture` de l'application Résidanat.

---

## Endpoint API Résidanat : `/api/webhooks/n8n-lecture`

L'application expose un endpoint sécurisé pour recevoir les cours générés :

- **Méthode** : `POST`
- **URL** : `/api/webhooks/n8n-lecture`
- **Headers** :
  - `Content-Type: application/json`
  - `x-n8n-secret: residanat_secret_token` *(ou `Authorization: Bearer <token_supabase>`)*
- **Body** (au choix) :
  1. Cours complet déjà généré en JSON :
     ```json
     {
       "lecture": {
         "schema": 1,
         "id": "boiterie_enfant",
         "otrNumber": 11,
         "name": "Boiterie chez l'enfant",
         "keys": [...],
         "contrasts": [...],
         "cards": [...],
         "quiz": [...],
         "vf": [...]
       }
     }
     ```
  2. Texte brut extrait du PDF (l'API appellera alors Gemini ou OpenAI directement) :
     ```json
     {
       "text": "Texte extrait du PDF...",
       "name": "Boiterie chez l'enfant",
       "otrNumber": 11,
       "id": "boiterie_enfant"
     }
     ```
