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

// ============ FIREBASE INIT ============
let serviceAccount;

try {
  if (process.env.FIREBASE_CONFIG) {
    serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
  } else {
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
      auth_uri: process.env.FIREBASE_AUTH_URI || "https://accounts.google.com/o/oauth2/auth",
      token_uri: process.env.FIREBASE_TOKEN_URI || "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL || "https://www.googleapis.com/oauth2/v1/certs",
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

// ============ GAME DATA STORAGE ============
const games = new Map();
const players = new Map();
const gameTimers = new Map();

// ============ DEFAULT TASKS - 15+ PER CATEGORY ============
const DEFAULT_TASKS = {
  tabu: [
    { palabra: 'supermercado', prohibidas: ['tienda', 'comprar', 'Mercadona'], nivel: 'A2' },
    { palabra: 'metro', prohibidas: ['transporte', 'tren', 'subterráneo'], nivel: 'A2' },
    { palabra: 'apartamento', prohibidas: ['casa', 'vivir', 'piso'], nivel: 'A2' },
    { palabra: 'paella', prohibidas: ['arroz', 'comida', 'Valencia'], nivel: 'A2' },
    { palabra: 'playa', prohibidas: ['mar', 'arena', 'Barceloneta'], nivel: 'A2' },
    { palabra: 'farmacia', prohibidas: ['medicinas', 'médico', 'pastillas'], nivel: 'A2' },
    { palabra: 'biblioteca', prohibidas: ['libros', 'leer', 'estudiar'], nivel: 'A2' },
    { palabra: 'gimnasio', prohibidas: ['deporte', 'ejercicio', 'músculos'], nivel: 'A2' },
    { palabra: 'restaurante', prohibidas: ['comida', 'comer', 'camarero'], nivel: 'A2' },
    { palabra: 'peluquería', prohibidas: ['pelo', 'cortar', 'cabello'], nivel: 'A2' },
    { palabra: 'aeropuerto', prohibidas: ['avión', 'volar', 'El Prat'], nivel: 'A2' },
    { palabra: 'hospital', prohibidas: ['médico', 'enfermo', 'salud'], nivel: 'A2' },
    { palabra: 'panadería', prohibidas: ['pan', 'croissant', 'horno'], nivel: 'A2' },
    { palabra: 'zapatería', prohibidas: ['zapatos', 'calzado', 'pies'], nivel: 'A2' },
    { palabra: 'lavadora', prohibidas: ['ropa', 'lavar', 'agua'], nivel: 'A2' },
    { palabra: 'nevera', prohibidas: ['frío', 'comida', 'cocina'], nivel: 'A2' },
    { palabra: 'vecino', prohibidas: ['persona', 'edificio', 'cerca'], nivel: 'A2' },
    { palabra: 'tarjeta', prohibidas: ['banco', 'dinero', 'pagar'], nivel: 'A2' },
    { palabra: 'cumpleaños', prohibidas: ['fiesta', 'regalo', 'años'], nivel: 'A2' },
    { palabra: 'vacaciones', prohibidas: ['descanso', 'viaje', 'verano'], nivel: 'A2' }
  ],

  conjugacion: [
    { verbo: 'tener', pregunta: '¿_____ mucho trabajo esta semana?', respuesta: 'Sí, tengo mucho trabajo / No, no tengo mucho trabajo', nivel: 'A2' },
    { verbo: 'hacer', pregunta: '¿_____ la compra en el supermercado o en el mercado?', respuesta: 'Hago la compra en...', nivel: 'A2' },
    { verbo: 'poner', pregunta: '¿_____ la lavadora todos los días?', respuesta: 'Sí, pongo / No, no pongo la lavadora...', nivel: 'A2' },
    { verbo: 'salir', pregunta: '¿_____ mucho por la noche?', respuesta: 'Sí, salgo / No, no salgo mucho...', nivel: 'A2' },
    { verbo: 'conocer', pregunta: '¿_____ bien el centro de Barcelona?', respuesta: 'Sí, conozco / No, no conozco bien...', nivel: 'A2' },
    { verbo: 'saber', pregunta: '¿_____ cocinar comida española?', respuesta: 'Sí, sé / No, no sé cocinar...', nivel: 'A2' },
    { verbo: 'poder', pregunta: '¿_____ hablar catalán?', respuesta: 'Sí, puedo / No, no puedo hablar...', nivel: 'A2' },
    { verbo: 'querer', pregunta: '¿_____ viajar a otras ciudades de España?', respuesta: 'Sí, quiero / No, no quiero viajar...', nivel: 'A2' },
    { verbo: 'preferir', pregunta: '¿_____ el metro o el autobús?', respuesta: 'Prefiero el metro / el autobús porque...', nivel: 'A2' },
    { verbo: 'levantarse', pregunta: '¿A qué hora _____ los lunes?', respuesta: 'Me levanto a las...', nivel: 'A2' },
    { verbo: 'acostarse', pregunta: '¿A qué hora _____ normalmente?', respuesta: 'Me acuesto a las...', nivel: 'A2' },
    { verbo: 'ducharse', pregunta: '¿_____ por la mañana o por la noche?', respuesta: 'Me ducho por la...', nivel: 'A2' },
    { verbo: 'vestirse', pregunta: '¿Cuánto tiempo _____ por la mañana?', respuesta: 'Me visto en... minutos', nivel: 'A2' },
    { verbo: 'ir', pregunta: '¿Cómo _____ al trabajo o a la escuela?', respuesta: 'Voy en metro / a pie / en bus...', nivel: 'A2' },
    { verbo: 'venir', pregunta: '¿De dónde _____ originalmente?', respuesta: 'Vengo de Rusia / de...', nivel: 'A2' },
    { verbo: 'traer', pregunta: '¿Qué _____ normalmente para comer?', respuesta: 'Traigo... / No traigo nada', nivel: 'A2' }
  ],

  palabrasPorTema: [
    { tema: 'Comida española', tiempo: 30, nivel: 'A2' },
    { tema: 'Partes del cuerpo', tiempo: 30, nivel: 'A2' },
    { tema: 'Ropa de verano', tiempo: 30, nivel: 'A2' },
    { tema: 'Transporte en Barcelona', tiempo: 30, nivel: 'A2' },
    { tema: 'Muebles de casa', tiempo: 30, nivel: 'A2' },
    { tema: 'Profesiones', tiempo: 30, nivel: 'A2' },
    { tema: 'Animales', tiempo: 30, nivel: 'A2' },
    { tema: 'Frutas y verduras', tiempo: 30, nivel: 'A2' },
    { tema: 'Colores', tiempo: 30, nivel: 'A2' },
    { tema: 'Días y meses', tiempo: 30, nivel: 'A2' },
    { tema: 'Lugares de Barcelona', tiempo: 30, nivel: 'A2' },
    { tema: 'Bebidas', tiempo: 30, nivel: 'A2' },
    { tema: 'Deportes', tiempo: 30, nivel: 'A2' },
    { tema: 'Electrodomésticos', tiempo: 30, nivel: 'A2' },
    { tema: 'Tiempo atmosférico', tiempo: 30, nivel: 'A2' }
  ],

  dialogos: [
    { tiempo: 'presente', situacion: 'Habla sobre tu rutina diaria en Barcelona. ¿Qué haces normalmente?', nivel: 'A2' },
    { tiempo: 'pasado', situacion: 'Cuenta qué hiciste el fin de semana pasado.', nivel: 'A2' },
    { tiempo: 'imperfecto', situacion: 'Describe cómo era tu vida en Rusia cuando eras pequeño/a.', nivel: 'A2' },
    { tiempo: 'futuro', situacion: 'Explica qué harás en las próximas vacaciones.', nivel: 'A2' },
    { tiempo: 'subjuntivo', situacion: 'Tu amigo quiere aprender español. Dale consejos: "Te recomiendo que..."', nivel: 'A2' },
    { tiempo: 'subjuntivo', situacion: 'Tu compañero de piso hace mucho ruido. Pídele: "Quiero que..."', nivel: 'A2' },
    { tiempo: 'subjuntivo', situacion: 'Habla de tus deseos: "Espero que..." / "Ojalá..."', nivel: 'A2' },
    { tiempo: 'pasado', situacion: 'Cuenta tu primer día en Barcelona. ¿Qué pasó?', nivel: 'A2' },
    { tiempo: 'imperfecto', situacion: 'Cuando vivías en Rusia, ¿qué comías normalmente?', nivel: 'A2' },
    { tiempo: 'presente', situacion: 'Describe tu barrio en Barcelona. ¿Qué hay? ¿Qué puedes hacer?', nivel: 'A2' },
    { tiempo: 'futuro', situacion: '¿Qué planes tienes para mejorar tu español?', nivel: 'A2' },
    { tiempo: 'pasado', situacion: 'Cuenta la última vez que fuiste a un restaurante.', nivel: 'A2' },
    { tiempo: 'subjuntivo', situacion: 'Tu amigo está enfermo. Desea: "Espero que te mejores pronto..."', nivel: 'A2' },
    { tiempo: 'imperfecto', situacion: 'Cuando tenías 10 años, ¿qué te gustaba hacer?', nivel: 'A2' },
    { tiempo: 'presente', situacion: '¿Qué diferencias hay entre Barcelona y tu ciudad de Rusia?', nivel: 'A2' }
  ],

  roleplay: [
    { escena: 'En el bar', rol1: 'Cliente', rol2: 'Camarero', instrucciones: 'Pide un café con leche y un croissant. Pregunta el precio.', vocabulario: ['poner', 'la cuenta', 'cuánto cuesta', 'para llevar'], nivel: 'A2' },
    { escena: 'En el supermercado', rol1: 'Cliente', rol2: 'Dependiente', instrucciones: 'Busca la sección de frutas. Pregunta dónde está el aceite de oliva.', vocabulario: ['dónde está', 'la sección de', 'oferta', 'tarjeta'], nivel: 'A2' },
    { escena: 'En el metro', rol1: 'Turista perdido', rol2: 'Barcelonés', instrucciones: 'Pregunta cómo llegar a la Sagrada Familia.', vocabulario: ['línea', 'transbordo', 'parada', 'dirección'], nivel: 'A2' },
    { escena: 'En la farmacia', rol1: 'Cliente', rol2: 'Farmacéutico', instrucciones: 'Tienes dolor de cabeza. Pide algo para el dolor.', vocabulario: ['me duele', 'pastillas', 'receta', 'tomar'], nivel: 'A2' },
    { escena: 'En el médico', rol1: 'Paciente', rol2: 'Médico', instrucciones: 'Explica tus síntomas: te duele la garganta y tienes fiebre.', vocabulario: ['síntomas', 'desde hace', 'recetar', 'descansar'], nivel: 'A2' },
    { escena: 'En la tienda de ropa', rol1: 'Cliente', rol2: 'Dependiente', instrucciones: 'Quieres comprar una camiseta. Pregunta si tienen tu talla.', vocabulario: ['talla', 'probador', 'quedar bien', 'rebajas'], nivel: 'A2' },
    { escena: 'En el restaurante', rol1: 'Cliente', rol2: 'Camarero', instrucciones: 'Pide el menú del día. Tienes alergia a los mariscos.', vocabulario: ['el menú', 'alergia', 'de primero', 'de segundo'], nivel: 'A2' },
    { escena: 'Alquilar un piso', rol1: 'Inquilino', rol2: 'Propietario', instrucciones: 'Pregunta sobre el alquiler, los gastos y las normas.', vocabulario: ['alquiler', 'fianza', 'gastos incluidos', 'mascotas'], nivel: 'A2' },
    { escena: 'En la playa', rol1: 'Turista', rol2: 'Socorrista', instrucciones: 'Pregunta si es seguro bañarse y dónde están las duchas.', vocabulario: ['bandera', 'peligroso', 'duchas', 'sombrilla'], nivel: 'A2' },
    { escena: 'En el banco', rol1: 'Cliente', rol2: 'Empleado', instrucciones: 'Quieres abrir una cuenta. Pregunta qué documentos necesitas.', vocabulario: ['cuenta corriente', 'NIE', 'tarjeta', 'transferencia'], nivel: 'A2' },
    { escena: 'En la peluquería', rol1: 'Cliente', rol2: 'Peluquero', instrucciones: 'Explica cómo quieres el corte de pelo.', vocabulario: ['cortar', 'un poco', 'flequillo', 'teñir'], nivel: 'A2' },
    { escena: 'Llamada telefónica', rol1: 'Llamador', rol2: 'Recepcionista', instrucciones: 'Llamas para pedir cita en el dentista.', vocabulario: ['cita', 'disponible', 'horario', 'confirmar'], nivel: 'A2' },
    { escena: 'En el gimnasio', rol1: 'Nuevo socio', rol2: 'Recepcionista', instrucciones: 'Pregunta sobre los precios y horarios del gimnasio.', vocabulario: ['matrícula', 'mensualidad', 'clases', 'vestuario'], nivel: 'A2' },
    { escena: 'En el aeropuerto', rol1: 'Pasajero', rol2: 'Empleado', instrucciones: 'Tu maleta no ha llegado. Explica el problema.', vocabulario: ['equipaje', 'reclamación', 'vuelo', 'descripción'], nivel: 'A2' },
    { escena: 'En la fiesta', rol1: 'Invitado nuevo', rol2: 'Anfitrión', instrucciones: 'Preséntate, pregunta quiénes son los otros invitados.', vocabulario: ['encantado', 'conocer', 'de dónde eres', 'qué tal'], nivel: 'A2' }
  ],

  preguntas: [
    { pregunta: '¿Qué es lo que más te gusta de vivir en Barcelona?', ayuda: 'Puedes hablar del clima, la gente, la comida, las playas...', nivel: 'A2' },
    { pregunta: '¿Qué echas de menos de Rusia?', ayuda: 'Comida, familia, amigos, clima, tradiciones...', nivel: 'A2' },
    { pregunta: '¿Cuál fue tu momento más difícil al llegar a España?', ayuda: 'Idioma, burocracia, cultura, soledad...', nivel: 'A2' },
    { pregunta: '¿Qué haces en tu tiempo libre en Barcelona?', ayuda: 'Deportes, paseos, amigos, cultura...', nivel: 'A2' },
    { pregunta: '¿Has visitado otras ciudades de España? ¿Cuáles?', ayuda: 'Madrid, Valencia, Sevilla, Granada...', nivel: 'A2' },
    { pregunta: '¿Cómo es tu rutina diaria?', ayuda: 'Mañana, tarde, noche, trabajo, estudio...', nivel: 'A2' },
    { pregunta: '¿Qué comida española te gusta más? ¿Y menos?', ayuda: 'Paella, tortilla, jamón, gazpacho...', nivel: 'A2' },
    { pregunta: '¿Celebras las fiestas españolas? ¿Cuáles?', ayuda: 'Sant Jordi, La Mercè, Navidad, Reyes...', nivel: 'A2' },
    { pregunta: '¿Cómo es tu barrio? ¿Te gusta vivir allí?', ayuda: 'Tranquilo, ruidoso, céntrico, servicios...', nivel: 'A2' },
    { pregunta: '¿Qué planes tienes para el futuro en España?', ayuda: 'Trabajo, estudios, familia, viajes...', nivel: 'A2' },
    { pregunta: '¿Qué diferencias culturales has notado entre Rusia y España?', ayuda: 'Horarios, comida, relaciones, trabajo...', nivel: 'A2' },
    { pregunta: '¿Cómo conociste a tus amigos en Barcelona?', ayuda: 'Trabajo, estudios, vecinos, actividades...', nivel: 'A2' },
    { pregunta: '¿Qué consejos darías a un ruso que viene a vivir a Barcelona?', ayuda: 'Idioma, papeles, vivienda, trabajo...', nivel: 'A2' },
    { pregunta: '¿Cuál es tu lugar favorito de Barcelona?', ayuda: 'Parque, playa, barrio, edificio...', nivel: 'A2' },
    { pregunta: '¿Qué habilidades has aprendido desde que vives en España?', ayuda: 'Idioma, cocina, independencia...', nivel: 'A2' }
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

// ============ INITIALIZE TASKS IN FIREBASE ============
const initializeTasks = async () => {
  try {
    for (const [collection, tasks] of Object.entries(DEFAULT_TASKS)) {
      const snapshot = await db.collection(collection).limit(1).get();
      
      if (snapshot.empty) {
        console.log(`📝 Creando tareas para: ${collection}`);
        for (const task of tasks) {
          await db.collection(collection).add({
            ...task,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
        console.log(`✅ ${tasks.length} tareas creadas en ${collection}`);
      }
    }
    console.log('✅ Todas las tareas inicializadas');
  } catch (e) {
    console.error('Error inicializando tareas:', e);
  }
};

// ============ HELPER FUNCTIONS ============
const generateRoomCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

const getRandomTasks = async (collection, count = 20, nivel = 'A2') => {
  try {
    const snapshot = await db.collection(collection).where('nivel', '==', nivel).get();
    const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const shuffled = tasks.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  } catch (e) {
    console.error(`Error getting tasks from ${collection}:`, e);
    return DEFAULT_TASKS[collection]?.slice(0, count) || [];
  }
};

// ============ SOCKET.IO EVENTS ============
io.on('connection', (socket) => {
  console.log('🔌 Nuevo jugador conectado:', socket.id);

  // ---- CREATE GAME ----
  socket.on('create_game', async (gameType) => {
    const roomCode = generateRoomCode();
    const game = {
      id: roomCode,
      type: gameType,
      players: { [socket.id]: { id: socket.id, name: 'Jugador 1', role: 'player1', ready: false } },
      scores: { player1: 0, player2: 0 },
      status: 'waiting',
      history: [],
      currentTaskIndex: 0,
      tasks: [],
      startTime: null,
      timerValue: 60
    };

    games.set(roomCode, game);
    players.set(socket.id, { gameId: roomCode, role: 'player1' });
    
    socket.join(roomCode);
    socket.emit('game_created', { roomCode, gameId: roomCode });
    
    console.log(`🎮 Juego creado: ${roomCode} (${gameType})`);
  });

  // ---- JOIN GAME ----
  socket.on('join_game', (code) => {
    const roomCode = code.toUpperCase();
    const game = games.get(roomCode);

    if (!game) {
      socket.emit('error', { message: 'Sala no encontrada. Verifica el código.' });
      return;
    }

    if (Object.keys(game.players).length >= 2) {
      socket.emit('error', { message: 'La sala está llena (2/2 jugadores)' });
      return;
    }

    game.players[socket.id] = { id: socket.id, name: 'Jugador 2', role: 'player2', ready: false };
    players.set(socket.id, { gameId: roomCode, role: 'player2' });

    socket.join(roomCode);
    io.to(roomCode).emit('player_joined', { playerCount: 2 });
    
    console.log(`👥 Jugador 2 se unió a: ${roomCode}`);
  });

  // ---- PLAYER READY ----
  socket.on('player_ready', ({ roomCode, player, ready }) => {
    const game = games.get(roomCode);
    if (!game) return;

    if (game.players[socket.id]) {
      game.players[socket.id].ready = ready;
    }

    io.to(roomCode).emit('player_ready', { player, ready });
  });

  // ---- START GAME ----
  socket.on('start_game', async (roomCode) => {
    const game = games.get(roomCode);
    if (!game) return;

    // Load tasks based on game type
    let tasks = [];
    let timerValue = 60;

    switch(game.type) {
      case 'tabu':
        tasks = await getRandomTasks('tabu', 20);
        timerValue = 120;
        break;
      case 'conjugacion':
        tasks = await getRandomTasks('conjugacion', 15);
        timerValue = 180;
        break;
      case 'palabras':
        tasks = await getRandomTasks('palabrasPorTema', 5);
        timerValue = 30;
        break;
      case 'dialogos':
        tasks = await getRandomTasks('dialogos', 10);
        timerValue = 300;
        break;
      case 'roleplay':
        tasks = await getRandomTasks('roleplay', 10);
        timerValue = 300;
        break;
      case 'preguntas':
        tasks = await getRandomTasks('preguntas', 15);
        timerValue = 300;
        break;
      case 'cadena':
        tasks = [{ tema: 'Cadena de palabras' }];
        timerValue = 120;
        break;
      case 'adivinanza':
        tasks = await getRandomTasks('adivinanza', 15);
        timerValue = 180;
        break;
      case 'batalla':
        tasks = [{ tiempo: 'presente' }];
        timerValue = 60;
        break;
    }

    game.tasks = tasks;
    game.status = 'active';
    game.startTime = Date.now();
    game.timerValue = timerValue;

    io.to(roomCode).emit('game_started', { 
      tasks, 
      time: timerValue,
      gameType: game.type
    });

    // Start timer
    startGameTimer(roomCode, timerValue);

    console.log(`🚀 Juego iniciado: ${roomCode}`);
  });

  // ---- SUBMIT ANSWER ----
  socket.on('submit_answer', (roomCode, data) => {
    const game = games.get(roomCode);
    if (!game) return;

    const historyEntry = {
      timestamp: Date.now(),
      playerId: socket.id,
      playerRole: players.get(socket.id)?.role,
      ...data
    };

    game.history.push(historyEntry);

    io.to(roomCode).emit('answer_submitted', { 
      playerId: socket.id,
      data: historyEntry
    });

    // Emit to admin watchers
    io.to(`admin_${roomCode}`).emit('game_update', game);
  });

  // ---- UPDATE SCORE ----
  socket.on('update_score', (roomCode, points) => {
    const game = games.get(roomCode);
    if (!game) return;

    const playerData = players.get(socket.id);
    if (playerData) {
      const role = playerData.role;
      game.scores[role] = (game.scores[role] || 0) + points;
      io.to(roomCode).emit('scores_updated', game.scores);
    }
  });

  // ---- NEXT TASK ----
  socket.on('next_task', (roomCode) => {
    const game = games.get(roomCode);
    if (!game) return;

    game.currentTaskIndex++;
    
    if (game.currentTaskIndex >= game.tasks.length) {
      // Game finished
      game.status = 'finished';
      io.to(roomCode).emit('game_finished', { scores: game.scores });
    } else {
      io.to(roomCode).emit('next_task', { 
        task: game.tasks[game.currentTaskIndex],
        index: game.currentTaskIndex
      });
    }
  });

  // ---- ADD WORD (for chain/palabras games) ----
  socket.on('add_word', ({ roomCode, word, player }) => {
    const game = games.get(roomCode);
    if (!game) return;

    io.to(roomCode).emit('word_added', { word, player });
  });

  // ============ ADMIN EVENTS ============
  socket.on('admin_login', (password) => {
    if (password === (process.env.ADMIN_PASSWORD || 'ksesha2025')) {
      socket.join('admin');
      socket.emit('admin_authenticated', { success: true });
      console.log('👨‍🏫 Admin conectado');
    } else {
      socket.emit('admin_authenticated', { success: false });
    }
  });

  socket.on('get_active_games', () => {
    const activeGames = Array.from(games.values())
      .filter(g => g.status === 'active' || g.status === 'waiting')
      .map(g => ({
        id: g.id,
        type: g.type,
        players: g.players,
        scores: g.scores,
        status: g.status,
        currentTaskIndex: g.currentTaskIndex,
        tasksCount: g.tasks?.length || 0
      }));
    socket.emit('active_games_list', activeGames);
  });

  socket.on('watch_game', (gameId) => {
    const game = games.get(gameId);
    if (game) {
      socket.join(`admin_${gameId}`);
      socket.emit('game_details', {
        ...game,
        gameData: { 
          tasks: game.tasks,
          currentTaskIndex: game.currentTaskIndex
        }
      });
    }
  });

  // ---- TASK MANAGEMENT ----
  socket.on('get_tasks', async (collection, nivel = 'A2') => {
    try {
      const snapshot = await db.collection(collection).get();
      const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      socket.emit('tasks_list', tasks);
    } catch (e) {
      socket.emit('error', { message: 'Error cargando tareas' });
    }
  });

  socket.on('add_task', async (collection, task) => {
    try {
      const docRef = await db.collection(collection).add({
        ...task,
        nivel: task.nivel || 'A2',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      socket.emit('task_added', { id: docRef.id, ...task });
      io.to('admin').emit('task_added_notification', { collection, task: { id: docRef.id, ...task } });
    } catch (e) {
      socket.emit('error', { message: 'Error añadiendo tarea' });
    }
  });

  socket.on('delete_task', async (collection, taskId) => {
    try {
      await db.collection(collection).doc(taskId).delete();
      socket.emit('task_deleted', { id: taskId });
      io.to('admin').emit('task_deleted_notification', { collection, taskId });
    } catch (e) {
      socket.emit('error', { message: 'Error eliminando tarea' });
    }
  });

  socket.on('update_task', async (collection, taskId, updates) => {
    try {
      await db.collection(collection).doc(taskId).update(updates);
      socket.emit('task_updated', { id: taskId, ...updates });
    } catch (e) {
      socket.emit('error', { message: 'Error actualizando tarea' });
    }
  });

  // ---- DISCONNECT ----
  socket.on('disconnect', () => {
    const playerData = players.get(socket.id);
    if (playerData) {
      const game = games.get(playerData.gameId);
      if (game) {
        delete game.players[socket.id];
        const remaining = Object.keys(game.players).length;
        
        io.to(playerData.gameId).emit('player_disconnected', { playerCount: remaining });
        
        if (remaining === 0) {
          // Clean up game
          const timer = gameTimers.get(playerData.gameId);
          if (timer) clearInterval(timer);
          gameTimers.delete(playerData.gameId);
          games.delete(playerData.gameId);
          console.log(`🗑️ Juego eliminado: ${playerData.gameId}`);
        }
      }
      players.delete(socket.id);
    }
    console.log('🔌 Jugador desconectado:', socket.id);
  });
});

// ============ TIMER FUNCTION ============
function startGameTimer(roomCode, duration) {
  let timeLeft = duration;
  
  const timer = setInterval(() => {
    timeLeft--;
    io.to(roomCode).emit('timer_update', timeLeft);
    
    if (timeLeft <= 0) {
      clearInterval(timer);
      gameTimers.delete(roomCode);
      
      const game = games.get(roomCode);
      if (game) {
        game.status = 'finished';
        io.to(roomCode).emit('game_finished', { scores: game.scores });
      }
    }
  }, 1000);
  
  gameTimers.set(roomCode, timer);
}

// ============ EXPRESS ROUTES ============
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date(), games: games.size });
});

app.get('/api/games', (req, res) => {
  const activeGames = Array.from(games.values())
    .filter(g => g.status === 'active' || g.status === 'waiting');
  res.json(activeGames);
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============ START SERVER ============
const PORT = process.env.PORT || 3000;

initializeTasks().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`🎮 Servidor iniciado en puerto ${PORT}`);
  });
});
