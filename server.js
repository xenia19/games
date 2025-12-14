import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Инициализация Firebase
let serviceAccount;

try {
  // Пытаемся парсить JSON если есть FIREBASE_CONFIG
  if (process.env.FIREBASE_CONFIG) {
    serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
  } else {
    // Или собираем из отдельных переменных
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('FIREBASE_PRIVATE_KEY не найден в переменных окружения');
    }

    serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: privateKey.includes('\\n') ? privateKey.replace(/\\n/g, '\n') : privateKey,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: process.env.FIREBASE_AUTH_URI,
      token_uri: process.env.FIREBASE_TOKEN_URI,
      auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
      client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
      universe_domain: "googleapis.com"
    };
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('✅ Firebase инициализирован успешно');
} catch (e) {
  console.error('🔴 Firebase init error:', e.message);
  console.error('Проверь переменные окружения FIREBASE_PRIVATE_KEY');
  process.exit(1);
}

const db = admin.firestore();
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// ИГРОВЫЕ ДАННЫЕ
const games = new Map(); // Хранит активные игры
const players = new Map(); // Хранит игроков и их комнаты

// ============ ИНИЦИАЛИЗАЦИЯ ЗАДАНИЙ ============

const initializeGames = async () => {
  try {
    const snapshot = await db.collection('tareas').get();
    if (snapshot.empty) {
      console.log('Создаю стартовые задания...');
      await createDefaultTasks();
    }
  } catch (e) {
    console.error('Error initializing games:', e);
  }
};

const createDefaultTasks = async () => {
  const defaultTasks = {
    tabu: [
      { palabra: 'supermercado', prohibidas: ['tienda', 'comprar', 'productos'], nivel: 'A2' },
      { palabra: 'metro', prohibidas: ['transporte', 'Barcelona', 'subterráneo'], nivel: 'A2' },
      { palabra: 'apartamento', prohibidas: ['casa', 'vivir', 'Barcelona'], nivel: 'A2' },
      { palabra: 'paella', prohibidas: ['comida', 'arroz', 'española'], nivel: 'A2' },
      { palabra: 'playa', prohibidas: ['agua', 'Barcelona', 'arena'], nivel: 'A2' },
      { palabra: 'café', prohibidas: ['bebida', 'desayuno', 'caliente'], nivel: 'A2' },
      { palabra: 'farmacia', prohibidas: ['medicinas', 'salud', 'doctor'], nivel: 'A2' },
      { palabra: 'biblioteca', prohibidas: ['libros', 'leer', 'estudiar'], nivel: 'A2' },
      { palabra: 'parque', prohibidas: ['naturaleza', 'árboles', 'paseo'], nivel: 'A2' },
      { palabra: 'lluvia', prohibidas: ['agua', 'tiempo', 'mojado'], nivel: 'A2' }
    ],
    conjugacion: [
      { pregunta: '(trabajar) 8 horas al día?', respuesta: 'Sí/No, (trabajar/no trabajar)...', nivel: 'A2' },
      { pregunta: '(vivir) en Barcelona desde hace cuánto tiempo?', respuesta: 'Vivo desde hace...', nivel: 'A2' },
      { pregunta: '(tener) mascotas?', respuesta: 'Sí/No, tengo...', nivel: 'A2' },
      { pregunta: '(hacer) la compra online o en la tienda?', respuesta: 'Hago la compra...', nivel: 'A2' },
      { pregunta: '(salir) por las noches?', respuesta: 'Sí/No, salgo...', nivel: 'A2' }
    ],
    palabrasPorTema: [
      { tema: 'Comida y bebida', tiempo: 30, nivel: 'A2' },
      { tema: 'Tiendas y compras', tiempo: 30, nivel: 'A2' },
      { tema: 'Transporte en Barcelona', tiempo: 30, nivel: 'A2' },
      { tema: 'Casa y muebles', tiempo: 30, nivel: 'A2' },
      { tema: 'Actividades del tiempo libre', tiempo: 30, nivel: 'A2' }
    ]
  };

  for (const [coleccion, tareas] of Object.entries(defaultTasks)) {
    for (const tarea of tareas) {
      try {
        await db.collection(coleccion).add({
          ...tarea,
          createdAt: new Date()
        });
      } catch (e) {
        console.error(`Error adding task to ${coleccion}:`, e);
      }
    }
  }
  console.log('Задания созданы!');
};

// ============ ФУНКЦИИ ПОМОЩИ ============

const createGame = (gameType) => {
  return {
    id: uuidv4(),
    type: gameType,
    players: {},
    scores: {},
    startTime: Date.now(),
    status: 'waiting',
    gameData: {},
    history: []
  };
};

const getRandomItems = async (collection, count, nivel = 'A2') => {
  try {
    const snapshot = await db.collection(collection).where('nivel', '==', nivel).get();
    const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    if (items.length === 0) return [];
    
    const shuffled = items.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  } catch (e) {
    console.error('Error getting items:', e);
    return [];
  }
};

// ============ SOCKET.IO СОБЫТИЯ ============

io.on('connection', (socket) => {
  console.log('Игрок подключился:', socket.id);

  // Создание новой игры
  socket.on('create_game', async (gameType) => {
    const game = createGame(gameType);
    games.set(game.id, game);
    players.set(socket.id, { gameId: game.id, role: 'player1' });
    
    socket.join(game.id);
    socket.emit('game_created', { gameId: game.id, roomCode: game.id.substring(0, 6) });
    
    console.log(`Игра создана: ${game.id} (${gameType})`);
  });

  // Присоединение ко второму игроку
  socket.on('join_game', (gameId) => {
    const game = games.get(gameId);
    
    if (!game) {
      socket.emit('error', { message: 'Игра не найдена' });
      return;
    }

    if (Object.keys(game.players).length >= 2) {
      socket.emit('error', { message: 'В игре уже 2 игрока' });
      return;
    }

    players.set(socket.id, { gameId, role: 'player2' });
    game.players[socket.id] = { id: socket.id, name: 'Игрок 2', ready: false };
    game.scores[socket.id] = 0;

    socket.join(gameId);
    io.to(gameId).emit('player_joined', { playerCount: Object.keys(game.players).length });
  });

  // Начало игры
  socket.on('start_game', async (gameId) => {
    const game = games.get(gameId);
    if (!game) return;

    game.status = 'active';
    game.startTime = Date.now();

    // Загружаем задания в зависимости от типа игры
    switch(game.type) {
      case 'tabu':
        const tabuTasks = await getRandomItems('tabu', 20, 'A2');
        game.gameData = {
          tasks: tabuTasks,
          currentTaskIndex: 0,
          player1Tasks: tabuTasks.slice(0, 10),
          player2Tasks: tabuTasks.slice(10, 20),
          rounds: 0,
          maxRounds: 10
        };
        break;
      
      case 'conjugacion':
        const conjTasks = await getRandomItems('conjugacion', 10, 'A2');
        game.gameData = {
          tasks: conjTasks,
          currentTaskIndex: 0,
          rounds: 0
        };
        break;

      case 'palabrasPorTema':
        const temasTasks = await getRandomItems('palabrasPorTema', 2, 'A2');
        game.gameData = {
          tasks: temasTasks,
          currentTaskIndex: 0,
          wordCount: { [Object.keys(game.players)[0]]: 0, [Object.keys(game.players)[1]]: 0 }
        };
        break;
    }

    io.to(gameId).emit('game_started', { gameData: game.gameData, gameType: game.type });
  });

  // Отправка ответа / слова
  socket.on('submit_answer', (gameId, data) => {
    const game = games.get(gameId);
    if (!game) return;

    game.history.push({
      timestamp: Date.now(),
      playerId: socket.id,
      action: data.action,
      value: data.value
    });

    io.to(gameId).emit('answer_submitted', {
      playerId: socket.id,
      data
    });
  });

  // Обновление баллов
  socket.on('update_score', (gameId, points) => {
    const game = games.get(gameId);
    if (!game) return;

    game.scores[socket.id] = (game.scores[socket.id] || 0) + points;
    io.to(gameId).emit('scores_updated', game.scores);
  });

  // ============ АДМИН-ПАНЕЛЬ СОБЫТИЯ ============

  socket.on('admin_login', (password) => {
    if (password === process.env.ADMIN_PASSWORD) {
      socket.emit('admin_authenticated', { success: true });
      socket.join('admin');
    } else {
      socket.emit('admin_authenticated', { success: false });
    }
  });

  socket.on('get_active_games', () => {
    const activeGames = Array.from(games.values()).filter(g => g.status === 'active' || g.status === 'waiting');
    socket.emit('active_games_list', activeGames);
  });

  socket.on('watch_game', (gameId) => {
    const game = games.get(gameId);
    if (game) {
      socket.join(`admin_${gameId}`);
      socket.emit('game_details', game);
    }
  });

  // ============ УПРАВЛЕНИЕ ЗАДАНИЯМИ ============

  socket.on('get_tasks', async (collection, nivel = 'A2') => {
    try {
      const snapshot = await db.collection(collection).where('nivel', '==', nivel).get();
      const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      socket.emit('tasks_list', tasks);
    } catch (e) {
      socket.emit('error', { message: 'Ошибка при загрузке заданий' });
    }
  });

  socket.on('add_task', async (collection, task) => {
    try {
      const docRef = await db.collection(collection).add({
        ...task,
        createdAt: new Date()
      });
      socket.emit('task_added', { id: docRef.id, ...task });
      io.to('admin').emit('task_added_notification', { collection, task: { id: docRef.id, ...task } });
    } catch (e) {
      socket.emit('error', { message: 'Ошибка при добавлении задания' });
    }
  });

  socket.on('delete_task', async (collection, taskId) => {
    try {
      await db.collection(collection).doc(taskId).delete();
      socket.emit('task_deleted', { id: taskId });
      io.to('admin').emit('task_deleted_notification', { collection, taskId });
    } catch (e) {
      socket.emit('error', { message: 'Ошибка при удалении задания' });
    }
  });

  socket.on('update_task', async (collection, taskId, updates) => {
    try {
      await db.collection(collection).doc(taskId).update(updates);
      socket.emit('task_updated', { id: taskId, ...updates });
      io.to('admin').emit('task_updated_notification', { collection, taskId, updates });
    } catch (e) {
      socket.emit('error', { message: 'Ошибка при обновлении задания' });
    }
  });

  // Отключение
  socket.on('disconnect', () => {
    const playerData = players.get(socket.id);
    if (playerData) {
      const gameId = playerData.gameId;
      const game = games.get(gameId);
      
      if (game) {
        delete game.players[socket.id];
        io.to(gameId).emit('player_disconnected', { playerCount: Object.keys(game.players).length });
        
        if (Object.keys(game.players).length === 0) {
          games.delete(gameId);
          console.log(`Игра удалена: ${gameId}`);
        }
      }
    }
    players.delete(socket.id);
    console.log('Игрок отключился:', socket.id);
  });
});

// ============ EXPRESS МАРШРУТЫ ============

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

app.get('/api/games', (req, res) => {
  const activeGames = Array.from(games.values()).filter(g => g.status === 'active' || g.status === 'waiting');
  res.json(activeGames);
});

// Раздача фронтенда
app.use(express.static(path.join(__dirname, 'build')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// ============ ЗАПУСК СЕРВЕРА ============

const PORT = process.env.PORT || 3000;

initializeGames().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`🎮 Сервер запущен на порту ${PORT}`);
  });
});
