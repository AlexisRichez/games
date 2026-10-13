# Saboteur en ligne

Version navigateur du jeu Saboteur (Frédéric Moyersoen / Amigo), de 3 à 10 joueurs, plus une variante non officielle à 2 joueurs.

## Lancer le serveur

Il faut Node.js (18 ou plus). Aucune dépendance à installer :

```
node server.js
# puis http://localhost:8000  (port modifiable : PORT=3000 node server.js)
```

Pour jouer à distance, le serveur doit être joignable par les joueurs : un VPS, un Raspberry Pi, ou votre PC avec une redirection de port sur la box.
Derrière un reverse proxy (nginx, Caddy…), pensez à transmettre les WebSocket sur le chemin `/ws`.

## Jouer

1. Ouvrir l'adresse du serveur, saisir son nom puis cliquer « Créer une partie ».
2. Envoyer le lien affiché (`…?room=saboteur-xxxxxx`) aux amis.
3. Quand tout le monde est dans le salon, l'hôte (le créateur) lance la partie.

Si un joueur recharge sa page, il reprend sa place automatiquement (même onglet). Personne n'a besoin de garder sa page ouverte pour que la partie continue.
Les parties sont gardées en mémoire : un redémarrage du serveur les efface.

## Technique

- `game.js` : moteur de règles (sans DOM), utilisé côté serveur et côté navigateur (affichage des coups possibles).
- `server.js` : sert les fichiers et fait tourner les parties. Il détient l'état complet et envoie à chaque joueur une vue filtrée (pas de mains adverses ni de rôles cachés côté client). WebSocket implémenté à la main, sans bibliothèque.
- `app.js` : interface ; n'envoie que des actions au serveur.
- `pixel.js` : images des cartes en pixel art, dessinées au vol dans un canvas (aucun fichier image). Toutes les cartes sont visibles sur `/cartes.html`.
- `fonts/` : polices pixel Press Start 2P et VT323 (licence SIL OFL, textes dans `fonts/OFL-*.txt`), servies localement.
- Aucun service tiers : ni serveur de mise en relation, ni CDN.
