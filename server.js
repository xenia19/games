import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import admin from 'firebase-admin';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Firebase
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
};

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

app.use(express.static('public'));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const rooms = new Map();
const players = new Map();

// ============ TASKS FROM DOCUMENT ============
const DEFAULT_TASKS = {
  tabu: [
    { palabra: 'alquiler', prohibidas: ['piso', 'pagar', 'contrato', 'dinero', 'mes'] },
    { palabra: 'jefe', prohibidas: ['trabajo', 'empresa', 'persona', 'mandar', 'oficina'] },
    { palabra: 'cita', prohibidas: ['médico', 'hora', 'hospital', 'visitar', 'salud'] },
    { palabra: 'pareja', prohibidas: ['amor', 'novio', 'novia', 'relación', 'persona'] },
    { palabra: 'mudanza', prohibidas: ['piso', 'cajas', 'cambiar', 'casa', 'vivir'] },
    { palabra: 'sueldo', prohibidas: ['dinero', 'trabajo', 'cobrar', 'mes', 'pagar'] },
    { palabra: 'resfriado', prohibidas: ['nariz', 'tos', 'gripe', 'frío', 'enfermo'] },
    { palabra: 'horario', prohibidas: ['trabajo', 'tiempo', 'horas', 'empezar', 'terminar'] },
    { palabra: 'entrevista', prohibidas: ['trabajo', 'preguntas', 'empresa', 'jefe', 'hablar'] },
    { palabra: 'contrato', prohibidas: ['firmar', 'trabajo', 'piso', 'papel', 'acuerdo'] },
    { palabra: 'descanso', prohibidas: ['dormir', 'parar', 'trabajo', 'tiempo', 'cansado'] },
    { palabra: 'urgencias', prohibidas: ['hospital', 'médico', 'rápido', 'dolor', 'salud'] },
    { palabra: 'vecino', prohibidas: ['vivir', 'cerca', 'edificio', 'piso', 'puerta'] },
    { palabra: 'farmacia', prohibidas: ['medicina', 'enfermo', 'comprar', 'pastillas', 'receta'] },
    { palabra: 'supermercado', prohibidas: ['comprar', 'comida', 'tienda', 'carro', 'productos'] },
    { palabra: 'gimnasio', prohibidas: ['ejercicio', 'deporte', 'músculos', 'entrenar', 'máquinas'] },
    { palabra: 'restaurante', prohibidas: ['comer', 'comida', 'camarero', 'mesa', 'carta'] },
    { palabra: 'peluquería', prohibidas: ['pelo', 'cortar', 'tijeras', 'peinar', 'lavar'] },
    { palabra: 'biblioteca', prohibidas: ['libros', 'leer', 'estudiar', 'silencio', 'prestar'] },
    { palabra: 'aeropuerto', prohibidas: ['avión', 'volar', 'viajar', 'maleta', 'pasaporte'] }
  ],
  conjugacion: [
    { verbo: 'trabajar', pregunta: '¿Dónde _____ antes de venir a Barcelona?', respuesta: 'trabajaba / trabajé' },
    { verbo: 'vivir', pregunta: '¿Cuánto tiempo _____ aquí?', respuesta: 'he vivido / llevo viviendo' },
    { verbo: 'buscar', pregunta: '¿Qué _____ ahora?', respuesta: 'busco' },
    { verbo: 'tener', pregunta: '¿Cuántos años _____?', respuesta: 'tienes' },
    { verbo: 'hacer', pregunta: '¿Qué _____ ayer después del trabajo?', respuesta: 'hice' },
    { verbo: 'ir', pregunta: '¿Cómo _____ al trabajo normalmente?', respuesta: 'voy / vas' },
    { verbo: 'poder', pregunta: '¿_____ ayudarme con esto?', respuesta: 'Puedes' },
    { verbo: 'querer', pregunta: '¿Qué _____ hacer este fin de semana?', respuesta: 'quieres' },
    { verbo: 'saber', pregunta: '¿_____ cocinar comida española?', respuesta: 'Sabes' },
    { verbo: 'conocer', pregunta: '¿_____ bien el centro de Barcelona?', respuesta: 'Conoces' },
    { verbo: 'levantarse', pregunta: '¿A qué hora _____ normalmente?', respuesta: 'te levantas / me levanto' },
    { verbo: 'acostarse', pregunta: '¿A qué hora _____ ayer?', respuesta: 'te acostaste / me acosté' },
    { verbo: 'sentirse', pregunta: '¿Cómo _____ hoy?', respuesta: 'te sientes / me siento' },
    { verbo: 'gustar', pregunta: '¿Qué comida española _____ más?', respuesta: 'te gusta' },
    { verbo: 'parecer', pregunta: '¿Qué _____ Barcelona?', respuesta: 'te parece' }
  ],
  palabrasPorTema: [
    { tema: 'Comida española' },
    { tema: 'Trabajo y oficina' },
    { tema: 'Partes del cuerpo' },
    { tema: 'Ropa' },
    { tema: 'Transporte en Barcelona' },
    { tema: 'Muebles de casa' },
    { tema: 'Profesiones' },
    { tema: 'Animales' },
    { tema: 'Frutas y verduras' },
    { tema: 'La ciudad' },
    { tema: 'El tiempo (clima)' },
    { tema: 'Emociones y sentimientos' },
    { tema: 'Ocio y tiempo libre' },
    { tema: 'Salud y médico' },
    { tema: 'Tecnología' }
  ],
  dialogos: [
    { situacion: '☕️ Café', fraseA: 'Trabajo en un café.', clave: 'AHORA', claveExplicacion: 'sейчас - presente' },
    { situacion: '🏠 Casa', fraseA: 'Vivo en Barcelona.', clave: 'ANTES', claveExplicacion: 'раньше - imperfecto' },
    { situacion: '😴 Cansancio', fraseA: 'Hoy trabajo hasta tarde.', clave: 'YA', claveExplicacion: 'уже/результат' },
    { situacion: '⏰ Llegar tarde', fraseA: 'Llego tarde al trabajo.', clave: 'QUIERO', claveExplicacion: 'хочу чтобы - subjuntivo' },
    { situacion: '🏥 Dolor', fraseA: 'Me duele la espalda.', clave: 'NECESITO', claveExplicacion: 'нужно чтобы - subjuntivo' },
    { situacion: '🍽️ Restaurante', fraseA: 'Vamos a un restaurante nuevo.', clave: 'ANTES', claveExplicacion: 'раньше - imperfecto' },
    { situacion: '📚 Estudiar', fraseA: 'Estudio español todos los días.', clave: 'AHORA', claveExplicacion: 'сейчас - presente' },
    { situacion: '🎉 Fiesta', fraseA: 'Mañana hay una fiesta.', clave: 'QUIERO', claveExplicacion: 'хочу чтобы - subjuntivo' },
    { situacion: '🛒 Compras', fraseA: 'Necesito ir al supermercado.', clave: 'YA', claveExplicacion: 'уже/результат' },
    { situacion: '✈️ Viaje', fraseA: 'El mes pasado fui a Madrid.', clave: 'ANTES', claveExplicacion: 'раньше - imperfecto' },
    { situacion: '🏋️ Gimnasio', fraseA: 'Voy al gimnasio tres veces a la semana.', clave: 'AHORA', claveExplicacion: 'сейчас - presente' },
    { situacion: '📱 Teléfono', fraseA: 'Mi teléfono no funciona bien.', clave: 'NECESITO', claveExplicacion: 'нужно чтобы - subjuntivo' }
  ],
roleplay: [
  {
    escena: 'Café',
    rol1: 'Cliente',
    rol2: 'Camarero',
    instrucciones: 
      'Cliente: el pedido no es lo que esperabas. Quejate.\n' +
      'Camarero: intenta arreglar la situación sin problemas.',
    vocabulario: ['poner', 'cuenta', 'propina', 'terraza', 'carta']
  },

  {
    escena: 'Médico',
    rol1: 'Paciente',
    rol2: 'Médico',
    instrucciones:
      'Paciente: te sientes mal desde hace días y estás preocupado.\n' +
      'Médico: haz preguntas y decide si necesita análisis o receta.',
    vocabulario: ['dolor', 'fiebre', 'receta', 'análisis', 'cita']
  },

  {
    escena: 'Piso (alquiler)',
    rol1: 'Inquilino',
    rol2: 'Propietario',
    instrucciones:
      'Inquilino: el piso tiene un problema y quieres una solución.\n' +
      'Propietario: minimiza el problema y evita gastar dinero.',
    vocabulario: ['fianza', 'gastos', 'amueblado', 'contrato', 'habitación']
  },

  {
    escena: 'Cita absurda',
    rol1: 'Persona puntual',
    rol2: 'Persona impuntual',
    instrucciones:
      'Puntual: esperas desde hace 30 minutos y estás molesto.\n' +
      'Impuntual: llegas tarde y actúas como si nada pasara.',
    vocabulario: ['esperar', 'llegar tarde', 'mensaje', 'perdón', 'tiempo']
  },

  {
    escena: 'Trabajo',
    rol1: 'Empleado',
    rol2: 'Jefe',
    instrucciones:
      'Empleado: quieres irte antes hoy.\n' +
      'Jefe: necesitas que se quede más tiempo.',
    vocabulario: ['horario', 'reunión', 'urgente', 'permiso', 'quedarse']
  },

  {
    escena: 'Trámite oficial',
    rol1: 'Ciudadano',
    rol2: 'Funcionario',
    instrucciones:
      'Ciudadano: no entiendes el proceso y estás frustrado.\n' +
      'Funcionario: explica las normas con lenguaje formal.',
    vocabulario: ['formulario', 'cita previa', 'fotocopia', 'plazo', 'requisito']
  }
],

  preguntas: [
    // A1 (20)
    { pregunta: '¿Dónde vives ahora?', nivel: 'A1' },
    { pregunta: '¿Trabajas o estudias?', nivel: 'A1' },
    { pregunta: '¿Te gusta Barcelona?', nivel: 'A1' },
    { pregunta: '¿Cómo vas al trabajo?', nivel: 'A1' },
    { pregunta: '¿Qué comes normalmente?', nivel: 'A1' },
    { pregunta: '¿Hablas español en tu trabajo?', nivel: 'A1' },
    { pregunta: '¿Con quién vives?', nivel: 'A1' },
    { pregunta: '¿Qué haces los fines de semana?', nivel: 'A1' },
    { pregunta: '¿Qué barrio te gusta?', nivel: 'A1' },
    { pregunta: '¿A qué hora empiezas a trabajar?', nivel: 'A1' },
    { pregunta: '¿Qué idioma hablas en casa?', nivel: 'A1' },
    { pregunta: '¿Te gusta tu piso?', nivel: 'A1' },
    { pregunta: '¿Tienes amigos aquí?', nivel: 'A1' },
    { pregunta: '¿Vas en metro o bus?', nivel: 'A1' },
    { pregunta: '¿Cocinas en casa?', nivel: 'A1' },
    { pregunta: '¿Trabajas cerca o lejos?', nivel: 'A1' },
    { pregunta: '¿Te gusta aprender español?', nivel: 'A1' },
    { pregunta: '¿Sales mucho por la noche?', nivel: 'A1' },
    { pregunta: '¿Vas al médico aquí?', nivel: 'A1' },
    { pregunta: '¿Te gusta el clima?', nivel: 'A1' },
    // A2 (20)
    { pregunta: '¿Por qué viniste a Barcelona?', nivel: 'A2' },
    { pregunta: '¿Qué fue lo más difícil al llegar?', nivel: 'A2' },
    { pregunta: '¿Qué hacías antes de venir?', nivel: 'A2' },
    { pregunta: '¿Qué haces ahora diferente?', nivel: 'A2' },
    { pregunta: '¿Qué te gusta más de la ciudad?', nivel: 'A2' },
    { pregunta: '¿Qué no te gusta y por qué?', nivel: 'A2' },
    { pregunta: '¿Cómo era tu vida antes?', nivel: 'A2' },
    { pregunta: '¿Qué has aprendido este año?', nivel: 'A2' },
    { pregunta: '¿Qué barrio te gustaba antes?', nivel: 'A2' },
    { pregunta: '¿Dónde trabajabas antes?', nivel: 'A2' },
    { pregunta: '¿Qué idioma usas más ahora?', nivel: 'A2' },
    { pregunta: '¿Qué has cambiado en tus hábitos?', nivel: 'A2' },
    { pregunta: '¿Qué necesitas mejorar en español?', nivel: 'A2' },
    { pregunta: '¿Qué fue lo más sorprendente?', nivel: 'A2' },
    { pregunta: '¿Qué extrañas de tu país?', nivel: 'A2' },
    { pregunta: '¿Qué te gustaría cambiar?', nivel: 'A2' },
    { pregunta: '¿Qué has hecho este mes?', nivel: 'A2' },
    { pregunta: '¿Cómo era tu trabajo antes?', nivel: 'A2' },
    { pregunta: '¿Qué haces ahora mejor?', nivel: 'A2' },
    { pregunta: '¿Qué esperas del próximo año?', nivel: 'A2' }
  ],
  adivinanza: [
    { palabra: 'metro', pistas: ['transporte', 'bajo tierra', 'rápido', 'líneas'] },
    { palabra: 'bar', pistas: ['bebidas', 'tapas', 'amigos', 'camarero'] },
    { palabra: 'café', pistas: ['bebida', 'caliente', 'mañana', 'negro'] },
    { palabra: 'cerveza', pistas: ['bebida', 'fría', 'bar', 'rubia'] },
    { palabra: 'bocadillo', pistas: ['pan', 'jamón', 'comer', 'rápido'] },
    { palabra: 'camisa', pistas: ['ropa', 'botones', 'trabajo', 'manga'] },
    { palabra: 'zapatos', pistas: ['pies', 'caminar', 'cuero', 'cordones'] },
    { palabra: 'móvil', pistas: ['llamar', 'WhatsApp', 'pantalla', 'bolsillo'] },
    { palabra: 'llaves', pistas: ['puerta', 'abrir', 'casa', 'metal'] },
    { palabra: 'mochila', pistas: ['espalda', 'llevar', 'cosas', 'estudiante'] },
    { palabra: 'piso', pistas: ['vivir', 'habitaciones', 'alquiler', 'edificio'] },
    { palabra: 'nevera', pistas: ['frío', 'cocina', 'comida', 'blanca'] },
    { palabra: 'cama', pistas: ['dormir', 'habitación', 'almohada', 'noche'] },
    { palabra: 'ducha', pistas: ['agua', 'baño', 'limpiar', 'jabón'] },
    { palabra: 'médico', pistas: ['hospital', 'enfermo', 'receta', 'bata'] },
    { palabra: 'farmacia', pistas: ['medicinas', 'pastillas', 'verde', 'cruz'] },
    { palabra: 'trabajo', pistas: ['oficina', 'dinero', 'jefe', 'horario'] },
    { palabra: 'dinero', pistas: ['pagar', 'euros', 'banco', 'billete'] },
    { palabra: 'fiesta', pistas: ['bailar', 'música', 'amigos', 'noche'] },
    { palabra: 'playa', pistas: ['arena', 'mar', 'sol', 'Barceloneta'] }
  ],
  batalla: [
    { tema: 'Rutina diaria' },
    { tema: 'Trabajo' },
    { tema: 'Vacaciones' },
    { tema: 'Casa y hogar' },
    { tema: 'Cocina y comida' },
    { tema: 'Transporte' },
    { tema: 'Emociones' },
    { tema: 'Deporte y salud' }
  ],
  cadena: [
    { instruccion: 'La última letra de una palabra = la primera de la siguiente. ¡No repitas!' }
  ]
};

// Initialize Firebase tasks
const initializeTasks = async () => {
  try {
    for (const [collection, tasks] of Object.entries(DEFAULT_TASKS)) {
      const snapshot = await db.collection(collection).limit(1).get();
      if (snapshot.empty) {
        console.log(`📝 Creating: ${collection}`);
        for (const task of tasks) {
          await db.collection(collection).add({ ...task, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        }
      }
    }
    console.log('✅ Tasks ready');
  } catch (error) {
    console.error('Firebase error:', error);
  }
};

const generateRoomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

const shuffle = (array) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const getTasksForGame = async (gameType) => {
  const collectionMap = {
    'tabu': 'tabu', 'conjugacion': 'conjugacion', 'palabras': 'palabrasPorTema',
    'dialogos': 'dialogos', 'roleplay': 'roleplay', 'preguntas': 'preguntas',
    'cadena': 'cadena', 'adivinanza': 'adivinanza', 'batalla': 'batalla'
  };
  const collection = collectionMap[gameType];
  if (!collection) return [];
  try {
    const snapshot = await db.collection(collection).get();
    let tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return shuffle(tasks).slice(0, gameType === 'cadena' ? 1 : 15);
  } catch (error) {
    return shuffle(DEFAULT_TASKS[collection] || []).slice(0, 15);
  }
};

// Timer management
const startTimer = (roomCode) => {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  if (room.timerInterval) clearInterval(room.timerInterval);
  room.timerPaused = false;
  
  room.timerInterval = setInterval(() => {
    if (!room.timerPaused && room.timer > 0) {
      room.timer--;
      io.to(roomCode).emit('timer_update', room.timer);
    }
  }, 1000);
};

const stopTimer = (roomCode) => {
  const room = rooms.get(roomCode);
  if (room?.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }
};

// ============ SOCKET HANDLERS ============
io.on('connection', (socket) => {
  console.log(`🔌 Connected: ${socket.id}`);

  // Player: Create room
  socket.on('create_room', () => {
    let roomCode;
    do { roomCode = generateRoomCode(); } while (rooms.has(roomCode));
    
    rooms.set(roomCode, {
      code: roomCode,
      players: { [socket.id]: { id: socket.id, role: 'player1', ready: false } },
      currentGame: null,
      scores: { player1: 0, player2: 0 },
      tasks: [],
      taskIndex: 0,
      currentTurn: 'player1',
      timer: 60,
      timerInterval: null,
      timerPaused: true
    });
    
    players.set(socket.id, { roomCode, role: 'player1' });
    socket.join(roomCode);
    socket.emit('room_created', { roomCode });
    console.log(`🏠 Room: ${roomCode}`);
  });

  // Player: Join room
  socket.on('join_room', (code) => {
    const roomCode = code.toUpperCase();
    const room = rooms.get(roomCode);
    
    if (!room) return socket.emit('error', { message: 'Sala no encontrada' });
    if (Object.keys(room.players).length >= 2) return socket.emit('error', { message: 'Sala llena' });
    
    room.players[socket.id] = { id: socket.id, role: 'player2', ready: false };
    players.set(socket.id, { roomCode, role: 'player2' });
    socket.join(roomCode);
    
    socket.emit('room_joined', { roomCode });
    socket.to(roomCode).emit('partner_joined');
    console.log(`👥 Joined: ${roomCode}`);
  });

  // Player: Select game
  socket.on('select_game', ({ roomCode, gameType }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    room.currentGame = gameType;
    Object.values(room.players).forEach(p => p.ready = false);
    io.to(roomCode).emit('game_selected', { gameType });
  });

  // Player: Ready
  socket.on('player_ready', ({ roomCode, ready }) => {
    const room = rooms.get(roomCode);
    const playerData = players.get(socket.id);
    if (!room || !playerData) return;
    
    if (room.players[socket.id]) room.players[socket.id].ready = ready;
    socket.to(roomCode).emit('player_ready_status', { player: playerData.role, ready });
  });

  // Player: Start game
  socket.on('start_game', async ({ roomCode, gameType }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    const tasks = await getTasksForGame(gameType);
    room.tasks = tasks;
    room.taskIndex = 0;
    room.scores = { player1: 0, player2: 0 };
    room.currentTurn = 'player1';
    room.timer = 60;
    room.timerPaused = true;
    
    io.to(roomCode).emit('game_started', { gameType, tasks, startingPlayer: 'player1' });
    startTimer(roomCode);
    console.log(`🚀 Game: ${gameType} in ${roomCode}`);
  });

  // Player: Return to games
  socket.on('return_to_games', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    stopTimer(roomCode);
    room.currentGame = null;
    room.tasks = [];
    room.taskIndex = 0;
    Object.values(room.players).forEach(p => p.ready = false);
    io.to(roomCode).emit('return_to_games');
  });

  // ============ ADMIN ============
  socket.on('admin_login', (password) => {
    const success = password === (process.env.ADMIN_PASSWORD || 'ksesha2025');
    socket.emit('admin_authenticated', { success });
    if (success) console.log('👨‍🏫 Admin in');
  });

  socket.on('admin_get_games', () => {
    const games = [];
    rooms.forEach((room, code) => {
      games.push({
        roomCode: code,
        currentGame: room.currentGame,
        playerCount: Object.keys(room.players).length,
        scores: room.scores,
        timer: room.timer,
        taskIndex: room.taskIndex,
        totalTasks: room.tasks.length
      });
    });
    socket.emit('admin_games_list', games);
  });

  socket.on('admin_watch_game', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    socket.emit('admin_game_data', {
      roomCode,
      currentGame: room.currentGame,
      scores: room.scores,
      timer: room.timer,
      timerPaused: room.timerPaused,
      currentTask: room.tasks[room.taskIndex] || null,
      taskIndex: room.taskIndex,
      totalTasks: room.tasks.length,
      currentTurn: room.currentTurn
    });
  });

  socket.on('admin_add_score', ({ roomCode, player, points }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    room.scores[player] = Math.max(0, (room.scores[player] || 0) + points);
    io.to(roomCode).emit('scores_updated', room.scores);
  });

  socket.on('admin_next_task', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    room.taskIndex++;
    room.currentTurn = room.currentTurn === 'player1' ? 'player2' : 'player1';
    room.timer = 60;
    if (room.taskIndex >= room.tasks.length) {
      io.to(roomCode).emit('game_finished', { finalScores: room.scores });
      stopTimer(roomCode);
    } else {
      io.to(roomCode).emit('next_task', { task: room.tasks[room.taskIndex], index: room.taskIndex, newTurn: room.currentTurn });
      io.to(roomCode).emit('timer_update', room.timer);
    }
  });

  socket.on('admin_switch_turn', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    room.currentTurn = room.currentTurn === 'player1' ? 'player2' : 'player1';
    io.to(roomCode).emit('turn_changed', { turn: room.currentTurn });
  });

  socket.on('admin_reset_timer', ({ roomCode, seconds }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    room.timer = seconds;
    room.timerPaused = false;
    io.to(roomCode).emit('timer_update', room.timer);
  });

  socket.on('admin_pause_timer', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    room.timerPaused = !room.timerPaused;
  });

  socket.on('admin_finish_game', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    stopTimer(roomCode);
    io.to(roomCode).emit('game_finished', { finalScores: room.scores });
  });

  socket.on('get_active_games', () => { const activeGames = []; rooms.forEach((room, code) => { activeGames.push({ id: code, roomCode: code, currentGame: room.currentGame, playerCount: Object.keys(room.players).length, scores: room.scores, gameState: room.gameState }); }); socket.emit('active_games_list', activeGames); });
socket.on('get_tasks', async (collection) => {
  try {
    const snapshot = await db.collection(collection).get();
    const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    socket.emit('tasks_list', tasks);
  } catch (error) {
    console.error('Error getting tasks:', error);
    socket.emit('tasks_list', []);
  }
});

socket.on('add_task', async (collection, taskData) => {
  try {
    const docRef = await db.collection(collection).add({
      ...taskData,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    socket.emit('task_added', { id: docRef.id, ...taskData });
    console.log(`📝 Task added to ${collection}`);
  } catch (error) {
    console.error('Error adding task:', error);
  }
});

socket.on('delete_task', async (collection, taskId) => {
  try {
    await db.collection(collection).doc(taskId).delete();
    socket.emit('task_deleted', { id: taskId });
    console.log(`🗑️ Task deleted from ${collection}`);
  } catch (error) {
    console.error('Error deleting task:', error);
  }
});

  // Disconnect
  socket.on('disconnect', () => {
    const playerData = players.get(socket.id);
    if (playerData) {
      const room = rooms.get(playerData.roomCode);
      if (room) {
        delete room.players[socket.id];
        if (Object.keys(room.players).length === 0) {
          stopTimer(playerData.roomCode);
          rooms.delete(playerData.roomCode);
        } else {
          io.to(playerData.roomCode).emit('partner_disconnected');
        }
      }
      players.delete(socket.id);
    }
    console.log(`🔌 Disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
initializeTasks().then(() => {
  server.listen(PORT, () => console.log(`🚀 Server: ${PORT}`));
});
