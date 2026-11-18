# French Registration Application (Kairos WhatsApp Learning Platform)

> **Mise à jour Intégration Phase 4 :**  
> Cette application d'inscription soumet désormais directement les données des étudiants à **l'API Backend Commune Kairos** (`POST /api/registrations`) connectée à **AWS RDS PostgreSQL** (`devdb`).
> La configuration Firebase existante et l'historique sont intégralement préservés conformément aux règles de protection Kairos.

### Configuration Clé
- **Point de terminaison API :** `POST ${VITE_API_BASE_URL}/registrations`
- **Variable d'environnement :** `VITE_API_BASE_URL=http://localhost:5000/api` (dans `.env` / `.env.example`)
- **Langue par défaut :** `fr` (soumise automatiquement)
- **Cours assigné :** `Cours de Réussite Commerciale` (assigné automatiquement par le backend)
- **Tables PostgreSQL cibles :** `wa_registrations`, `wa_payments`, `wa_courses`, `wa_enrollments`

---

# Application d'Inscription Sécurisée (Phase 1)

Application web d'inscription grand public en langue française, développée avec **React, Vite, Bootstrap 5 et Firebase (Spark Plan - 100% gratuit)**.

---

## 1. Architecture & Contraintes Budgétaires (Firebase Spark)

Cette application a été conçue pour fonctionner exclusivement sous le **forfait gratuit Firebase Spark (No-Cost)** sans aucune dépendance envers :
- ❌ Firebase Cloud Functions
- ❌ Le plan payant Firebase Blaze
- ❌ Un compte de facturation ou carte bancaire
- ❌ Une API ou un backend externe payant

### Quotas Gratuits Firebase Spark & Stratégie d'Optimisation
- **Cloud Firestore** : 50 000 lectures / jour, 20 000 écritures / jour, 1 Gio de stockage.
- **Firebase Hosting** : 10 Gio de stockage, 360 Mo / jour de transfert de données.
- **Stratégie d'accès optimisée** :
  - **Aucune lecture globale** : L'application n'effectue jamais de requête de listing sur la collection `registrations`.
  - **Écriture directe déterministe** : Les documents sont indexés par le hachage SHA-256 de l'adresse e-mail normalisée.
  - **Règles de sécurité strictes** : Interdiction absolue de lister l'ensemble des inscriptions (`allow list: if false`), protégeant ainsi à la fois la vie privée des utilisateurs et les quotas gratuits de la base de données.

---

## 2. Prévention des Doublons d'E-mail (Sans Cloud Functions)

Afin de respecter le plan gratuit sans serveur d'arrière-plan de confiance :

1. L'adresse e-mail est nettoyée et passée en minuscules (ex: `Jean.Dupont@Example.COM` ➔ `jean.dupont@example.com`).
2. Un hachage cryptographique **SHA-256** est calculé directement dans le navigateur à l'aide de l'API standard `crypto.subtle` (Web Crypto API).
3. Ce hachage hexadécimal (64 caractères) est utilisé comme identifiant de document Firestore :
   ```
   registrations/{emailHash}
   ```
4. Lors de la soumission :
   - Si le document existe déjà ou si les règles de sécurité rejettent l'écriture (`!exists`), l'application affiche immédiatement le message en français :
     > **« Cette adresse e-mail est déjà enregistrée. »**
   - Aucun document en double n'est créé.

### Avertissement de Sécurité & Limite d'Architecture
> **NOTE IMPORTANTE :**
> Cette application utilise intentionnellement uniquement les services gratuits Firebase Spark. En l'absence de backend de confiance (ex: Cloud Functions), la prévention des doublons repose sur un identifiant de document déterministe basé sur l'e-mail. Ce mécanisme empêche efficacement les soumissions multiples dans le cadre d'un usage normal, mais ne constitue pas une garantie d'unicité absolue au niveau serveur face à un client malveillant.

---

## 3. Structure du Projet

```text
Reg_Sprout_French/
│
├── public/
│   ├── favicon.svg              # Favicon SVG officiel
│   ├── qr-code.png              # QR Code haute résolution (2048x2048) pour impression
│   └── qr-code.svg              # QR Code vectoriel infini pour affiches/brochures
│
├── scripts/
│   ├── generate-qr.js           # Générateur de QR code de production sans API externe
│   └── test-validation.js       # Suite de tests automatisés (validation, normalisation, SHA-256)
│
├── src/
│   ├── components/
│   │   └── RegistrationForm.jsx # Composant formulaire avec validation française et icônes
│   │
│   ├── firebase/
│   │   ├── firebaseConfig.js    # Initialisation Firebase Modular SDK & Firestore
│   │   └── registrationService.js # Service d'inscription, hashing & gestion des erreurs
│   │
│   ├── pages/
│   │   ├── Registration.jsx     # Page d'accueil formulaire (/registration)
│   │   └── ThankYou.jsx         # Écran de remerciement (/thank-you)
│   │
│   ├── styles/
│   │   └── custom.css           # Système de design UI/UX réactif avec Bootstrap & FontAwesome
│   │
│   ├── utils/
│   │   ├── emailHash.js         # Normalisation et hachage SHA-256 via Web Crypto API
│   │   └── validation.js        # Validations françaises (téléphone mobile, nom, email, ville, profession)
│   │
│   ├── App.jsx                  # Configuration des routes React Router
│   ├── index.css                # Styles globaux
│   └── main.jsx                 # Point d'entrée de l'application
│
├── .env.example                 # Modèle des variables d'environnement
├── .env                         # Variables d'environnement locales
├── .gitignore                   # Exclusion de node_modules, dist et .env
├── firebase.json                # Configuration Firebase Hosting (SPA rewrites) et Firestore
├── firestore.rules              # Règles de sécurité Firestore de production
├── index.html                   # Document HTML en français
├── package.json                 # Dépendances et scripts npm
└── README.md                    # Documentation complète
```

---

## 4. Spécifications des Champs et Validations Françaises

| Champ | Format & Règles | Valeur stockée | Message d'erreur |
|---|---|---|---|
| **Nom** | Requis, 2 à 100 caractères, lettres avec accents français, tirets, apostrophes. | Chaîne nettoyée | *Veuillez saisir votre nom complet.* |
| **Numéro de téléphone** | Requis, mobiles français `06` ou `07`, international `+33 6` ou `+33 7`. Espaces et points acceptés. | `+336XXXXXXXX` ou `+337XXXXXXXX` | *Veuillez saisir un numéro de téléphone français valide.* |
| **Adresse e-mail** | Requis, format RFC valide, nettoyé et passé en minuscules. | Minuscules | *Veuillez saisir une adresse e-mail valide.* |
| **Ville** | Requis, 2 à 100 caractères, accents français, tirets et apostrophes acceptés. | Chaîne nettoyée | *Veuillez saisir votre ville.* |
| **Profession** | Requis, sélection parmi la liste déroulante autorisée. | Chaîne sélectionnée | *Veuillez sélectionner votre profession.* |

**Options du menu Profession :**
- `Étudiant(e)`
- `Enseignant(e)`
- `Professionnel(le) en activité`
- `Femme/Homme au foyer`
- `Étudiant(e) universitaire`

---

## 5. Règles de Sécurité Firestore (`firestore.rules`)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /registrations/{emailHash} {
      // Interdiction de lister toutes les inscriptions (anti-scraping)
      allow list: if false;

      // Lecture d'un document individuel pour vérification d'existence
      allow get: if true;

      // Création autorisée UNIQUEMENT si le document n'existe pas encore
      // et respecte scrupuleusement la structure et les types requis
      allow create: if !exists(/databases/$(database)/documents/registrations/$(emailHash))
        && request.resource.data.keys().hasAll(['name', 'phone', 'email', 'city', 'occupation', 'createdAt'])
        && request.resource.data.name is string
        && request.resource.data.name.size() >= 2
        && request.resource.data.name.size() <= 100
        && request.resource.data.phone is string
        && request.resource.data.phone.matches('^\\+33[67][0-9]{8}$')
        && request.resource.data.email is string
        && request.resource.data.email.size() <= 254
        && request.resource.data.city is string
        && request.resource.data.city.size() >= 2
        && request.resource.data.city.size() <= 100
        && request.resource.data.occupation in [
          'Étudiant(e)',
          'Enseignant(e)',
          'Professionnel(le) en activité',
          'Femme/Homme au foyer',
          'Étudiant(e) universitaire'
        ]
        && request.resource.data.createdAt == request.time;

      // Interdiction formelle de modifier ou supprimer une inscription
      allow update, delete: if false;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

## 6. Installation & Démarrage en Local

### 1. Cloner et installer les dépendances
```bash
npm install
```

### 2. Configurer les variables d'environnement
Copiez `.env.example` vers `.env` et saisissez vos clés Firebase de projet Spark :
```bash
cp .env.example .env
```

### 3. Lancer les tests unitaires automatisés
Exécute la suite de tests validant l'ensemble des règles de validation, normalisation de téléphone et hachage SHA-256 :
```bash
npm test
```

### 4. Lancer le serveur de développement
```bash
npm run dev
```

### 5. Compiler pour la production
```bash
npm run build
```

---

## 7. Déploiement sur Firebase Hosting (Spark Plan)

### Étape 1 : Installer le CLI Firebase (si non installé)
```bash
npm install -g firebase-tools
```

### Étape 2 : Se connecter à votre compte Google/Firebase
```bash
firebase login
```

### Étape 3 : Associer le projet Firebase
```bash
firebase use --add
```
*(Sélectionnez votre projet Firebase configuré sur le plan Spark).*

### Étape 4 : Déployer le site et les règles Firestore
```bash
npm run build
firebase deploy --only hosting,firestore
```

Une fois le déploiement terminé, Firebase affiche l'URL finale de production, par exemple :
```text
Hosting URL: https://votre-projet.web.app
```

---

## 8. Génération du QR Code de Production

Conformément aux spécifications, le QR code ne doit **jamais** pointer vers `localhost` ou `127.0.0.1`.

Après avoir obtenu votre URL de production finale, générez vos QR codes haute définition (PNG 2048x2048 et SVG vectoriel) grâce à la commande intégrée :

```bash
npm run generate-qr -- https://votre-projet.web.app/registration
```

Fichiers générés automatiquement dans le dossier `public/` :
- `public/qr-code.png` : PNG 2048x2048 avec marge blanche et correction d'erreur niveau H (idéal pour flyers et impressions standards).
- `public/qr-code.svg` : Fichier vectoriel infini (idéal pour affiches géantes, roll-ups et imprimeries professionnelles).

---

## 9. Liste de Contrôle des Tests (Checklist de Validation)

- [x] **Redirection racine** : L'accès à `/` redirige immédiatement vers `/registration`.
- [x] **Affichage de la page** : Titre `"Formulaire d'inscription"` et sous-titre officiel en français.
- [x] **Soumission formulaire vide** : Déclenchement de l'alerte générale et des 5 messages d'erreur de champ en français.
- [x] **Validation du Nom** : Rejet des noms < 2 caractères, rejet des chiffres seuls, acceptation des accents (`Éléonore François-Martin`).
- [x] **Téléphone français** :
  - `06 12 34 56 78` ➔ Normalisé en `+33612345678`
  - `07.12.34.56.78` ➔ Normalisé en `+33712345678`
  - `+33 6 12 34 56 78` ➔ Normalisé en `+33612345678`
  - Rejet des lettres et numéros fixes non mobiles.
- [x] **Adresse e-mail** : Normalisation en minuscules (`Jean.Dupont@Example.COM` ➔ `jean.dupont@example.com`).
- [x] **Hachage SHA-256 déterministe** : Les versions minuscules et majuscules d'un même email produisent le même SHA-256 de 64 caractères hexadécimaux.
- [x] **Prévention des doublons** : Détection immédiate du document existant et affichage de `"Cette adresse e-mail est déjà enregistrée."`.
- [x] **Écran de remerciement (`/thank-you`)** : Badge animé, messages de confirmation, bouton `"Retour au formulaire"`, aucune information sensible exposée.
- [x] **SPA Firebase Hosting** : Configuration des réécritures (`rewrites: [ { "source": "**", "destination": "/index.html" } ]`) prévenant toute erreur 404 lors du rafraîchissement d'une page.
- [x] **Contraintes budgétaires vérifiées** : 0 Cloud Function, 0 plan Blaze, 0 compte de facturation requis.

---

## 10. Phase 2 (Tableau de Bord Administrateur / Staff System)

Phase 2 introduces a completely English internal dashboard for staff management while preserving the public French registration flow.

### Project Overview
- **Phase 1**: Public users register in French at `/registration`.
- **Phase 2**: Internal staff manage registrations and reports in English at `/paymentstaff` and `/reportstaff`.

### Routes
- `/registration` : Public French Registration
- `/thank-you` : Confirmation screen
- `/login` : Staff Login
- `/paymentstaff` : Dashboard for Payment/Registration Staff
- `/reportstaff` : Dashboard for Report Staff
- `/unauthorized` : Access denied page

### Firebase Setup
This application strictly uses the **same existing Firebase Spark (free) project** from Phase 1. 
- No Cloud Functions or Blaze billing is required.
- The `registrations` collection is shared between the public app and the staff dashboard.

### Security Note
This application is designed to remain compatible with Firebase Spark/free plan.
Firebase Authentication provides staff identity.
Firestore Security Rules provide authorization.
Email duplicate prevention uses deterministic SHA-256 document IDs.
There is no trusted custom backend.
Client-side logic should never be treated as the security boundary.
Firestore Security Rules are the actual database security boundary.

### Staff Setup Instructions

#### Payment Staff
Create Firebase Authentication user:
```text
Email: payment.staff@example.com
Password: CHANGE_THIS_PASSWORD
```
Then copy the Firebase Auth UID. Create `staffUsers/{UID}` in Firestore with:
```javascript
{
  email: "payment.staff@example.com",
  displayName: "Payment Staff",
  role: "payment_staff",
  active: true
}
```

#### Report Staff
Create Firebase Authentication user:
```text
Email: report.staff@example.com
Password: CHANGE_THIS_PASSWORD
```
Then create `staffUsers/{UID}` in Firestore with:
```javascript
{
  email: "report.staff@example.com",
  displayName: "Report Staff",
  role: "report_staff",
  active: true
}
```

### Deployment
To deploy both Phase 1 and Phase 2:
```bash
npm install
npm run build
firebase deploy --only hosting,firestore
```
