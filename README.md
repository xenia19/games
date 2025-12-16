# 🎮 Juegos — Interactive Spanish Learning Games

A full-stack web app for learning Spanish through 10 interactive games. Students play in pairs while teachers monitor progress and manage tasks in real-time.

📦 **Repository:** [https://github.com/xenia19/juegos](https://github.com/xenia19/juegos)

---

## 📌 About

Juegos is a **React + Node.js + Firebase** platform designed for language learners.
Students can practice vocabulary and grammar through engaging games, while teachers track progress via a real-time admin panel.

---

## ✨ Features

* 🕹 **10 interactive games** (vocabulary, verbs, dialogues, roleplay, guessing, charades)
* 🔄 **Real-time multiplayer** via WebSocket
* 👨‍🏫 **Admin panel** for monitoring and task management
* 💾 **Firebase** database for storing tasks and results
* 🎨 Fully interactive and responsive UI

---

## 🛠 Tech Stack

* **Frontend:** React
* **Backend:** Node.js + Express + Socket.io
* **Database:** Firebase Firestore
* **Deployment:** Render.com
* **Realtime Communication:** WebSockets

---

## 🚀 Quick Start

```bash
# Clone the repo
git clone https://github.com/xenia19/juegos.git
cd juegos

# Install dependencies
npm install

# Create .env with Firebase credentials
FIREBASE_PROJECT_ID=...
FIREBASE_PRIVATE_KEY=...
FIREBASE_CLIENT_EMAIL=...
ADMIN_PASSWORD=your_password

# Start backend
node server.js

# Start frontend
npm run dev

# Open in browser
http://localhost:3001
```

---

## 📱 Usage

* **Students:** Create or join a room via code, start playing games in pairs.
* **Teacher:** Log in with admin password, monitor games live, add or edit tasks.

---

## 📄 License

Educational project created by **Xenia**.
