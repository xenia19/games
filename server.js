const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const admin = require('firebase-admin');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Firebase setup
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

// ============ DATA STORAGE ============
const rooms = new Map();      // roomCode -> room data
const players = new Map();    // socket.id -> { roomCode, role }

// ============ DEFAULT TASKS ============
const DEFAULT_TASKS = {
  tabu: [
    { palabra: 'supermercado', prohibidas: ['comprar', 'comida', 'tienda'], nivel: 'A2' },
    { palabra: 'metro', prohibidas: ['tren', 'transporte', 'subterráneo'], nivel: 'A2' },
    { palabra: 'apartamento', prohibidas: ['casa', 'vivir', 'piso'], nivel: 'A2' },
    { palabra: 'paella', prohibidas: ['arroz', 'España', 'comida'], nivel: 'A2' },
    { palabra: 'playa', prohibidas: ['mar', 'arena', 'nadar'], nivel: 'A2' },
    { palabra: 'farmacia', prohibidas: ['medicina', 'enfermo', 'comprar'], nivel: 'A2' },
    { palabra: 'biblioteca', prohibidas: ['libros', 'leer', 'estudiar'], nivel: 'A2' },
    { palabra: 'gimnasio', prohibidas: ['ejercicio', 'deporte', 'músculos'], nivel: 'A2' },
    { palabra: 'restaurante', prohibidas: ['comer', 'comida', 'camarero'], nivel: 'A2' },
    { palabra: 'peluquería', prohibidas: ['pelo', 'cortar', 'tijeras'], nivel: 'A2' },
    { palabra: 'aeropuerto', prohibidas: ['avión', 'volar', 'viajar'], nivel: 'A2' },
    { palabra: 'hospital', prohibidas: ['médico', 'enfermo', 'enfermera'], nivel: 'A2' },
    { palabra: 'panadería', prohibidas: ['pan', 'comprar', 'horno'], nivel: 'A2' },
    { palabra: 'zapatería', prohibidas: ['zapatos', 'comprar', 'pies'], nivel: 'A2' },
    { palabra: 'lavadora', prohibidas: ['ropa', 'lavar', 'agua'], nivel: 'A2' },
    { palabra: 'nevera', prohibidas: ['frío', 'comida', 'cocina'], nivel: 'A2' },
    { palabra: 'vecino', prohibidas: ['vivir', 'cerca', 'edificio'], nivel: 'A2' },
    { palabra: 'tarjeta', prohibidas: ['pagar', 'banco', 'dinero'], nivel: 'A2' },
    { palabra: 'cumpleaños', prohibidas: ['fiesta', 'años', 'regalo'], nivel: 'A2' },
    { palabra: 'vacaciones', prohibidas: ['descansar', 'viajar', 'verano'], nivel: 'A2' }
  ],
  conjugacion: [
    { verbo: 'tener', pregunta: '¿Cuántos años _____ (tú)?', respuesta: 'tienes', nivel: 'A2' },
    { verbo: 'hacer', pregunta: '¿Qué _____ (tú) los fines de semana?', respuesta: 'haces', nivel: 'A2' },
    { verbo: 'poner', pregunta: '¿Dónde _____ (tú) las llaves?', respuesta: 'pones', nivel: 'A2' },
    { verbo: 'salir', pregunta: '¿A qué hora _____ (tú) de casa?', respuesta: 'sales', nivel: 'A2' },
    { verbo: 'conocer', pregunta: '¿_____ (tú) Barcelona bien?', respuesta: 'Conoces', nivel: 'A2' },
    { verbo: 'saber', pregunta: '¿_____ (tú) cocinar paella?', respuesta: 'Sabes', nivel: 'A2' },
    { verbo: 'poder', pregunta: '¿_____ (tú) ayudarme?', respuesta: 'Puedes', nivel: 'A2' },
    { verbo: 'querer', pregunta: '¿_____ (tú) ir al cine?', respuesta: 'Quieres', nivel: 'A2' },
    { verbo: 'preferir', pregunta: '¿Qué _____ (tú), café o té?', respuesta: 'prefieres', nivel: 'A2' },
    { verbo: 'levantarse', pregunta: '¿A qué hora _____ (tú)?', respuesta: 'te levantas', nivel: 'A2' },
    { verbo: 'acostarse', pregunta: '¿A qué hora _____ (tú)?', respuesta: 'te acuestas', nivel: 'A2' },
    { verbo: 'ducharse', pregunta: '¿Por la mañana o por la noche _____ (tú)?', respuesta: 'te duchas', nivel: 'A2' },
    { verbo: 'vestirse', pregunta: '¿Cómo _____ (tú) para ir al trabajo?', respuesta: 'te vistes', nivel: 'A2' },
    { verbo: 'ir', pregunta: '¿Cómo _____ (tú) al trabajo?', respuesta: 'vas', nivel: 'A2' },
    { verbo: 'venir', pregunta: '¿De dónde _____ (tú)?', respuesta: 'vienes', nivel: 'A2' },
    { verbo: 'traer', pregunta: '¿Qué _____ (tú) a la fiesta?', respuesta: 'traes', nivel: 'A2' }
  ],
  palabrasPorTema: [
    { tema: 'Comida española', nivel: 'A2' },
    { tema: 'Partes del cuerpo', nivel: 'A2' },
    { tema: 'Ropa de verano', nivel: 'A2' },
    { tema: 'Transporte en Barcelona', nivel: 'A2' },
    { tema: 'Muebles de casa', nivel: 'A2' },
    { tema: 'Profesiones', nivel: 'A2' },
    { tema: 'Animales', nivel: 'A2' },
    { tema: 'Frutas y verduras', nivel: 'A2' },
    { tema: 'Colores', nivel: 'A2' },
    { tema: 'Días y meses', nivel: 'A2' },
    { tema: 'Lugares de Barcelona', nivel: 'A2' },
    { tema: 'Bebidas', nivel: 'A2' },
    { tema: 'Deportes', nivel: 'A2' },
    { tema: 'Electrodomésticos', nivel: 'A2' },
    { tema: 'Tiempo atmosférico', nivel: 'A2' }
  ],
  dialogos: [
    { tiempo: 'presente', situacion: 'Estás en un café con tu amigo. Habla de tu rutina diaria.', nivel: 'A2' },
    { tiempo: 'pasado', situacion: 'Cuenta qué hiciste ayer después del trabajo.', nivel: 'A2' },
    { tiempo: 'imperfecto', situacion: 'Describe cómo era tu vida en tu país antes de venir a España.', nivel: 'A2' },
    { tiempo: 'futuro', situacion: 'Habla de tus planes para las próximas vacaciones.', nivel: 'A2' },
    { tiempo: 'presente', situacion: 'Describe tu barrio y qué hay cerca de tu casa.', nivel: 'A2' },
    { tiempo: 'pasado', situacion: 'Cuenta una experiencia divertida que tuviste en Barcelona.', nivel: 'A2' },
    { tiempo: 'imperfecto', situacion: 'Describe cómo eran tus veranos cuando eras niño/a.', nivel: 'A2' },
    { tiempo: 'futuro', situacion: 'Habla de lo que harás este fin de semana.', nivel: 'A2' },
    { tiempo: 'presente', situacion: 'Describe tu trabajo o estudios actuales.', nivel: 'A2' },
    { tiempo: 'pasado', situacion: 'Cuenta tu último viaje.', nivel: 'A2' },
    { tiempo: 'subjuntivo', situacion: 'Da consejos a un amigo que quiere aprender español.', nivel: 'A2' },
    { tiempo: 'subjuntivo', situacion: 'Expresa deseos para el año nuevo.', nivel: 'A2' },
    { tiempo: 'presente', situacion: 'Habla sobre tu comida favorita y cómo se prepara.', nivel: 'A2' },
    { tiempo: 'pasado', situacion: 'Cuenta cómo fue tu primera semana en Barcelona.', nivel: 'A2' },
    { tiempo: 'futuro', situacion: 'Describe cómo será tu vida dentro de 5 años.', nivel: 'A2' }
  ],
  roleplay: [
    { escena: 'En el bar', rol1: 'Cliente', rol2: 'Camarero', instrucciones: 'Pide algo de beber y comer', vocabulario: ['poner', 'cuenta', 'propina', 'terraza'], nivel: 'A2' },
    { escena: 'En el supermercado', rol1: 'Cliente', rol2: 'Dependiente', instrucciones: 'Pregunta dónde están los productos', vocabulario: ['pasillo', 'oferta', 'bolsa', 'caja'], nivel: 'A2' },
    { escena: 'En el metro', rol1: 'Turista', rol2: 'Pasajero local', instrucciones: 'Pide indicaciones para llegar a Sagrada Familia', vocabulario: ['línea', 'transbordo', 'parada', 'billete'], nivel: 'A2' },
    { escena: 'En la farmacia', rol1: 'Cliente', rol2: 'Farmacéutico', instrucciones: 'Explica tus síntomas y pide medicina', vocabulario: ['dolor', 'receta', 'pastillas', 'jarabe'], nivel: 'A2' },
    { escena: 'En el médico', rol1: 'Paciente', rol2: 'Médico', instrucciones: 'Describe cómo te sientes', vocabulario: ['fiebre', 'dolor', 'cita', 'análisis'], nivel: 'A2' },
    { escena: 'En una tienda de ropa', rol1: 'Cliente', rol2: 'Dependiente', instrucciones: 'Busca una camiseta y pregunta por tallas', vocabulario: ['probador', 'talla', 'rebaja', 'quedar'], nivel: 'A2' },
    { escena: 'En un restaurante', rol1: 'Cliente', rol2: 'Camarero', instrucciones: 'Pide el menú del día y pregunta por alergias', vocabulario: ['carta', 'primer plato', 'postre', 'cuenta'], nivel: 'A2' },
    { escena: 'Alquilando un piso', rol1: 'Inquilino', rol2: 'Propietario', instrucciones: 'Pregunta sobre el piso y las condiciones', vocabulario: ['fianza', 'gastos', 'amueblado', 'contrato'], nivel: 'A2' },
    { escena: 'En la playa', rol1: 'Turista', rol2: 'Socorrista', instrucciones: 'Pregunta sobre las normas de la playa', vocabulario: ['bandera', 'sombrilla', 'chiringuito', 'olas'], nivel: 'A2' },
    { escena: 'En el banco', rol1: 'Cliente', rol2: 'Empleado', instrucciones: 'Quieres abrir una cuenta', vocabulario: ['cuenta', 'tarjeta', 'transferencia', 'cajero'], nivel: 'A2' },
    { escena: 'En la peluquería', rol1: 'Cliente', rol2: 'Peluquero', instrucciones: 'Explica cómo quieres el corte de pelo', vocabulario: ['cortar', 'flequillo', 'teñir', 'lavar'], nivel: 'A2' },
    { escena: 'Llamada telefónica', rol1: 'Llamador', rol2: 'Receptor', instrucciones: 'Llama para hacer una reserva en un restaurante', vocabulario: ['reservar', 'mesa', 'persona', 'hora'], nivel: 'A2' },
    { escena: 'En el gimnasio', rol1: 'Nuevo cliente', rol2: 'Recepcionista', instrucciones: 'Pregunta por las tarifas y horarios', vocabulario: ['abono', 'clase', 'vestuario', 'entrenador'], nivel: 'A2' },
    { escena: 'En el aeropuerto', rol1: 'Pasajero', rol2: 'Personal de facturación', instrucciones: 'Factura tu maleta y pregunta por la puerta', vocabulario: ['equipaje', 'embarque', 'puerta', 'asiento'], nivel: 'A2' },
    { escena: 'En una fiesta', rol1: 'Invitado nuevo', rol2: 'Anfitrión', instrucciones: 'Preséntate y conoce a la gente', vocabulario: ['presentar', 'conocer', 'encantado', 'copa'], nivel: 'A2' }
  ],
  preguntas: [
    { pregunta: '¿Por qué decidiste venir a Barcelona?', ayuda: 'Trabajo, estudios, familia, clima, cultura...', nivel: 'A2' },
    { pregunta: '¿Qué es lo que más te gusta de vivir en España?', ayuda: 'Comida, gente, clima, cultura, idioma...', nivel: 'A2' },
    { pregunta: '¿Qué echas de menos de tu país?', ayuda: 'Familia, amigos, comida, costumbres...', nivel: 'A2' },
    { pregunta: '¿Cuál fue tu momento más difícil al llegar a España?', ayuda: 'Idioma, burocracia, cultura, soledad...', nivel: 'A2' },
    { pregunta: '¿Qué haces en tu tiempo libre en Barcelona?', ayuda: 'Deportes, paseos, amigos, cultura...', nivel: 'A2' },
    { pregunta: '¿Has visitado otras ciudades de España? ¿Cuáles?', ayuda: 'Madrid, Valencia, Sevilla, Granada...', nivel: 'A2' },
    { pregunta: '¿Cómo es tu rutina diaria?', ayuda: 'Mañana, tarde, noche, trabajo, estudio...', nivel: 'A2' },
    { pregunta: '¿Qué comida española te gusta más? ¿Y menos?', ayuda: 'Paella, tortilla, jamón, gazpacho...', nivel: 'A2' },
    { pregunta: '¿Celebras las fiestas españolas? ¿Cuáles?', ayuda: 'Sant Jordi, La Mercè, Navidad, Reyes...', nivel: 'A2' },
    { pregunta: '¿Cómo es tu barrio? ¿Te gusta vivir allí?', ayuda: 'Tranquilo, ruidoso, céntrico, servicios...', nivel: 'A2' },
    { pregunta: '¿Qué planes tienes para el futuro en España?', ayuda: 'Trabajo, estudios, familia, viajes...', nivel: 'A2' },
    { pregunta: '¿Qué diferencias culturales has notado entre tu país y España?', ayuda: 'Horarios, comida, relaciones, trabajo...', nivel: 'A2' },
    { pregunta: '¿Cómo conociste a tus amigos en Barcelona?', ayuda: 'Trabajo, estudios, vecinos, actividades...', nivel: 'A2' },
    { pregunta: '¿Qué consejos darías a alguien que viene a vivir a Barcelona?', ayuda: 'Idioma, papeles, vivienda, trabajo...', nivel: 'A2' },
    { pregunta: '¿Cuál es tu lugar favorito de Barcelona?', ayuda: 'Parque, playa, barrio, edificio...', nivel: 'A2' }
  ],
  adivinanza: [
    { respuesta: 'playa', pistas: ['arena', 'mar', 'sol', 'verano', 'Barceloneta'], nivel: 'A2' },
    { respuesta: 'metro', pistas: ['transporte', 'bajo tierra', 'rápido', 'L1 L2 L3'], nivel: 'A2' },
    { respuesta: 'paella', pistas: ['arroz', 'Valencia', 'sartén grande', 'marisco'], nivel: 'A2' },
    { respuesta: 'Sagrada Familia', pistas: ['Gaudí', 'iglesia', 'turistas', 'famosa'], nivel: 'A2' },
    { respuesta: 'sangría', pistas: ['bebida', 'fruta', 'vino', 'verano'], nivel: 'A2' },
    { respuesta: 'siesta', pistas: ['dormir', 'tarde', 'descanso', 'español'], nivel: 'A2' },
    { respuesta: 'tapas', pistas: ['pequeño', 'bar', 'compartir', 'comida'], nivel: 'A2' },
    { respuesta: 'flamenco', pistas: ['baile', 'España', 'guitarra', 'vestido'], nivel: 'A2' },
    { respuesta: 'tortilla', pistas: ['huevo', 'patata', 'redonda', 'española'], nivel: 'A2' },
    { respuesta: 'Ramblas', pistas: ['calle', 'Barcelona', 'centro', 'turistas'], nivel: 'A2' },
    { respuesta: 'jamón', pistas: ['cerdo', 'caro', 'ibérico', 'delicioso'], nivel: 'A2' },
    { respuesta: 'bicing', pistas: ['bicicleta', 'Barcelona', 'alquiler', 'rojo'], nivel: 'A2' },
    { respuesta: 'mercado', pistas: ['comida', 'fresco', 'Boquería', 'comprar'], nivel: 'A2' },
    { respuesta: 'churros', pistas: ['frito', 'dulce', 'desayuno', 'chocolate'], nivel: 'A2' },
    { respuesta: 'Park Güell', pistas: ['Gaudí', 'colores', 'dragón', 'vistas'], nivel: 'A2' }
  ]
};

// ============ INITIALIZE TASKS ============
const initializeTasks = async () => {
  try {
    for (const [collection, tasks] of Object.entries(DEFAULT_TASKS)) {
      const snapshot = await db.collection(collection).limit(1).get();
      if (snapshot.empty) {
        console.log(`📝 Creating tasks for: ${collection}`);
        for (const task of tasks) {
          await db.collection(collection).add({ ...task, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        }
        console.log(`✅ ${tasks.length} tasks created in ${collection}`);
      }
    }
    console.log('✅ Tasks initialization complete');
  } catch (error) {
    console.error('Error initializing tasks:', error);
  }
};

// ============ HELPERS ============
const generateRoomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

const getTasksForGame = async (gameType) => {
  const collectionMap = {
    'tabu': 'tabu',
    'conjugacion': 'conjugacion',
    'palabras': 'palabrasPorTema',
    'dialogos': 'dialogos',
    'roleplay': 'roleplay',
    'preguntas': 'preguntas',
    'cadena': null,
    'adivinanza': 'adivinanza',
    'batalla': null
  };
  
  const collection = collectionMap[gameType];
  if (!collection) return [];
  
  try {
    const snapshot = await db.collection(collection).get();
    const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // Shuffle tasks
    for (let i = tasks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
    }
    return tasks.slice(0, 10); // Return max 10 tasks
  } catch (error) {
    console.error('Error getting tasks:', error);
    return DEFAULT_TASKS[collection]?.slice(0, 10) || [];
  }
};

// ============ SOCKET HANDLERS ============
io.on('connection', (socket) => {
  console.log(`🔌 Connected: ${socket.id}`);

  // ---- CREATE ROOM ----
  socket.on('create_room', () => {
    let roomCode;
    do { roomCode = generateRoomCode(); } while (rooms.has(roomCode));
    
    const room = {
      code: roomCode,
      players: { [socket.id]: { id: socket.id, role: 'player1', ready: false } },
      currentGame: null,
      gameState: null,
      scores: { player1: 0, player2: 0 },
      tasks: [],
      taskIndex: 0,
      currentTurn: 'player1',
      history: [],
      words: [],
      timer: null,
      timerValue: 0
    };
    
    rooms.set(roomCode, room);
    players.set(socket.id, { roomCode, role: 'player1' });
    socket.join(roomCode);
    
    socket.emit('room_created', { roomCode });
    console.log(`🏠 Room created: ${roomCode}`);
  });

  // ---- JOIN ROOM ----
  socket.on('join_room', (code) => {
    const roomCode = code.toUpperCase();
    const room = rooms.get(roomCode);
    
    if (!room) {
      socket.emit('error', { message: 'Sala no encontrada' });
      return;
    }
    
    if (Object.keys(room.players).length >= 2) {
      socket.emit('error', { message: 'La sala está llena' });
      return;
    }
    
    room.players[socket.id] = { id: socket.id, role: 'player2', ready: false };
    players.set(socket.id, { roomCode, role: 'player2' });
    socket.join(roomCode);
    
    socket.emit('room_joined', { roomCode });
    socket.to(roomCode).emit('partner_joined');
    console.log(`👥 Player 2 joined: ${roomCode}`);
  });

  // ---- SELECT GAME ----
  socket.on('select_game', ({ roomCode, gameType }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    room.currentGame = gameType;
    room.gameState = 'waiting';
    
    // Reset ready states
    Object.values(room.players).forEach(p => p.ready = false);
    
    io.to(roomCode).emit('game_selected', { gameType });
    console.log(`🎮 Game selected: ${gameType} in ${roomCode}`);
  });

  // ---- PLAYER READY ----
  socket.on('player_ready', ({ roomCode, ready }) => {
    const room = rooms.get(roomCode);
    const playerData = players.get(socket.id);
    if (!room || !playerData) return;
    
    if (room.players[socket.id]) {
      room.players[socket.id].ready = ready;
    }
    
    // Notify other player
    socket.to(roomCode).emit('player_ready_status', { player: playerData.role, ready });
    
    // Check if both ready
    const allReady = Object.values(room.players).every(p => p.ready);
    if (allReady && Object.keys(room.players).length === 2) {
      console.log(`✅ Both players ready in ${roomCode}`);
    }
  });

  // ---- START GAME ----
  socket.on('start_game', async ({ roomCode, gameType }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    const tasks = await getTasksForGame(gameType);
    
    room.tasks = tasks;
    room.taskIndex = 0;
    room.scores = { player1: 0, player2: 0 };
    room.history = [];
    room.words = [];
    room.currentTurn = 'player1';
    room.gameState = 'playing';
    
    // Timer only for specific games
    const gamesWithTimer = ['palabras', 'batalla'];
    const hasTimer = gamesWithTimer.includes(gameType);
    const timerDuration = gameType === 'palabras' ? 30 : gameType === 'batalla' ? 60 : 0;
    
    io.to(roomCode).emit('game_started', {
      gameType,
      tasks,
      startingPlayer: 'player1',
      hasTimer,
      timerDuration
    });
    
    // Start timer if needed
    if (hasTimer) {
      room.timerValue = timerDuration;
      room.timer = setInterval(() => {
        room.timerValue--;
        io.to(roomCode).emit('timer_update', room.timerValue);
        
        if (room.timerValue <= 0) {
          clearInterval(room.timer);
          room.timer = null;
          io.to(roomCode).emit('timer_finished');
          io.to(roomCode).emit('game_finished');
        }
      }, 1000);
    }
    
    console.log(`🚀 Game started: ${gameType} in ${roomCode}`);
  });

  // ---- UPDATE SCORE ----
  socket.on('update_score', ({ roomCode, player, points }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    room.scores[player] = (room.scores[player] || 0) + points;
    io.to(roomCode).emit('scores_updated', room.scores);
  });

  // ---- NEXT TASK ----
  socket.on('next_task', ({ roomCode, switchTurn }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    room.taskIndex++;
    
    if (switchTurn) {
      room.currentTurn = room.currentTurn === 'player1' ? 'player2' : 'player1';
    }
    
    if (room.taskIndex >= room.tasks.length) {
      io.to(roomCode).emit('game_finished');
    } else {
      io.to(roomCode).emit('next_task', {
        task: room.tasks[room.taskIndex],
        index: room.taskIndex,
        switchTurn
      });
      
      if (switchTurn) {
        io.to(roomCode).emit('turn_changed', { turn: room.currentTurn });
      }
    }
  });

  // ---- SUBMIT ANSWER ----
  socket.on('submit_answer', ({ roomCode, action, value, player }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    const entry = { timestamp: Date.now(), data: { action, value, player } };
    room.history.push(entry);
    io.to(roomCode).emit('answer_submitted', entry);
  });

  // ---- ADD WORD ----
  socket.on('add_word', ({ roomCode, word, player }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    room.words.push({ word, player });
    io.to(roomCode).emit('word_added', { word, player });
  });

  // ---- FINISH GAME ----
  socket.on('finish_game', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    if (room.timer) {
      clearInterval(room.timer);
      room.timer = null;
    }
    
    io.to(roomCode).emit('game_finished');
  });

  // ---- RETURN TO GAMES ----
  socket.on('return_to_games', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    if (room.timer) {
      clearInterval(room.timer);
      room.timer = null;
    }
    
    room.currentGame = null;
    room.gameState = null;
    room.tasks = [];
    room.taskIndex = 0;
    room.history = [];
    room.words = [];
    Object.values(room.players).forEach(p => p.ready = false);
    
    io.to(roomCode).emit('return_to_games');
  });

  // ---- ADMIN LOGIN ----
  socket.on('admin_login', (password) => {
    const success = password === (process.env.ADMIN_PASSWORD || 'ksesha2025');
    socket.emit('admin_authenticated', { success });
    if (success) console.log('👨‍🏫 Admin logged in');
  });

  // ---- GET ACTIVE GAMES ----
  socket.on('get_active_games', () => {
    const activeGames = [];
    rooms.forEach((room, code) => {
      activeGames.push({
        id: code,
        roomCode: code,
        currentGame: room.currentGame,
        playerCount: Object.keys(room.players).length,
        scores: room.scores,
        gameState: room.gameState
      });
    });
    socket.emit('active_games_list', activeGames);
  });

  // ---- GET TASKS ----
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

  // ---- ADD TASK ----
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

  // ---- DELETE TASK ----
  socket.on('delete_task', async (collection, taskId) => {
    try {
      await db.collection(collection).doc(taskId).delete();
      socket.emit('task_deleted', { id: taskId });
      console.log(`🗑️ Task deleted from ${collection}`);
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  });

  // ---- DISCONNECT ----
  socket.on('disconnect', () => {
    const playerData = players.get(socket.id);
    if (playerData) {
      const room = rooms.get(playerData.roomCode);
      if (room) {
        delete room.players[socket.id];
        
        if (Object.keys(room.players).length === 0) {
          if (room.timer) clearInterval(room.timer);
          rooms.delete(playerData.roomCode);
          console.log(`🏠 Room deleted: ${playerData.roomCode}`);
        } else {
          io.to(playerData.roomCode).emit('partner_disconnected');
        }
      }
      players.delete(socket.id);
    }
    console.log(`🔌 Disconnected: ${socket.id}`);
  });
});

// ============ START SERVER ============
const PORT = process.env.PORT || 3000;
initializeTasks().then(() => {
  server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
});
