# Agora – serveur multi-IA

Ce projet envoie ta question à 5 IA en même temps (Claude, ChatGPT, Gemini, Mistral, Grok) et affiche leurs réponses, en français ou en anglais.

## Ce qu'il te faut

1. **Node.js** (version LTS) : télécharge-le sur nodejs.org et installe-le.
2. **Au moins une clé d'API** (tu peux commencer avec une seule). Cherche le nom de chaque fournisseur + « API key » : Anthropic, OpenAI, Google AI Studio, Mistral, xAI. Chaque clé est liée à un compte, souvent avec un moyen de paiement.

## Installation

1. Dézippe le dossier `agora-serveur`.
2. Dans ce dossier, copie le fichier `.env.example` et renomme la copie en `.env`.
3. Ouvre `.env` avec un éditeur de texte et colle tes clés à la place de `COLLE_TA_CLE_ICI`. Une IA sans clé s'affichera « Non configurée », sans bloquer les autres.
4. Vérifie les noms de modèles dans `.env` : ils changent souvent, regarde la documentation de chaque fournisseur.
5. Ouvre un terminal dans le dossier (sur Windows : clic droit > « Ouvrir dans le terminal ») et lance :

```
npm install
npm start
```

6. Ouvre http://localhost:3000 dans ton navigateur et pose une question.

## Ajouter les clés depuis la page d'administration

Au lieu de modifier `.env`, tu peux gérer les clés dans le navigateur :

1. Dans `.env`, remplace `CHOISIS_UN_MOT_DE_PASSE_LONG` par un vrai mot de passe long (ADMIN_PASSWORD), puis relance `npm start`.
2. Ouvre http://localhost:3000/admin.html et entre ce mot de passe.
3. Pour chaque IA : colle la clé, indique le nom du modèle, clique sur **Enregistrer**, puis sur **Tester**.
4. Les clés sont gardées dans `data/keys.json` sur le serveur. La page n'en réaffiche que les 4 derniers caractères.

Une clé saisie dans l'administration est prioritaire sur celle du fichier `.env`.

**Attention :** sur certains hébergeurs (offres gratuites de Render, par exemple), le disque est effacé à chaque redémarrage et les clés saisies disparaissent. En ligne, utilise plutôt les variables d'environnement de l'hébergeur, ou un disque persistant (variable `DATA_DIR`). Utilise toujours HTTPS en ligne, car le mot de passe d'administration transite par le réseau. Les clés sont enregistrées en clair dans `data/keys.json` : protège l'accès au serveur.

## Sécurité (important)

- Ne partage **jamais** le fichier `.env` et ne mets jamais une clé dans la page web : elles restent sur le serveur.
- Dans le tableau de bord de chaque fournisseur, **fixe une limite de dépense mensuelle** pour éviter les mauvaises surprises.
- Le serveur limite chaque visiteur à 10 questions par minute. Garde cette protection.

## Mettre en ligne

Des hébergeurs comme Render, Railway ou Fly.io acceptent ce type de projet. Tu y renseignes les mêmes variables que dans `.env` (dans leurs réglages, pas dans le code). Commande de démarrage : `npm start`.

## Comment ça marche

- `server.js` : reçoit la question, l'envoie aux 5 IA en parallèle et renvoie les réponses. Si une IA est en panne, les autres répondent quand même.
- `public/index.html` : la page affichée, avec le choix français / anglais.
- `public/admin.html` : la page où tu ajoutes et testes les clés.
- La langue choisie est transmise aux IA, qui répondent dans cette langue.
- Chaque question déclenche 5 appels d'IA, plus 1 appel pour la synthèse. L'onglet « Débat » ajoute 5 appels, mais seulement quand on l'ouvre.
- Le classement affiche pour l'instant les votes de ton appareil. Un classement partagé entre tous les utilisateurs demandera la base de données.

## Étapes suivantes

Comptes utilisateurs et abonnement (Stripe), base de données pour garder les questions, mode débat entre les IA, modération et mentions légales.
