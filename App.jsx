import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css';

// Главное приложение
export default function App() {
  const [view, setView] = useState('menu'); // menu, game, admin
  const [gameType, setGameType] = useState(null);
  const [gameId, setGameId] = useState(null);
  const [socket, setSocket] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const newSocket = io(window.location.origin);
    setSocket(newSocket);
    return () => newSocket.close();
  }, []);

  const handleCreateGame = (type) => {
    setGameType(type);
    socket?.emit('create_game', type);
    setView('game');
  };

  const handleAdminLogin = (password) => {
    socket?.emit('admin_login', password);
  };

  return (
    <div className="app">
      {view === 'menu' && (
        <MainMenu 
          onSelectGame={handleCreateGame}
          onAdminClick={() => setView('admin')}
        />
      )}
      {view === 'game' && gameType && (
        <GameContainer 
          socket={socket}
          gameType={gameType}
          onBack={() => setView('menu')}
        />
      )}
      {view === 'admin' && (
        <AdminPanel 
          socket={socket}
          onLogout={() => setView('menu')}
          onLogin={handleAdminLogin}
        />
      )}
    </div>
  );
}

// ============ ГЛАВНОЕ МЕНЮ ============

function MainMenu({ onSelectGame, onAdminClick }) {
  const games = [
    { id: 'tabu', name: '🤐 Tabú', desc: 'Объясняй слово без запретных слов' },
    { id: 'conjugacion', name: '📝 Спряжение глаголов', desc: 'Один спрягает, другой отвечает' },
    { id: 'palabrasPorTema', name: '⚡ Слова по теме (30 сек)', desc: 'Сколько слов ты знаешь?' },
    { id: 'dialogos', name: '💬 Диалоги времён', desc: 'Практика past/present/subjuntivo' },
    { id: 'roleplay', name: '🎭 Roleplay Barcelona', desc: 'В кафе, магазине, на улице' },
    { id: 'preguntas', name: '❓ Личные вопросы', desc: 'Отвечай на личные вопросы' },
    { id: 'encadenamiento', name: '🔗 Цепочка слов', desc: 'Последняя буква = первая буква' },
    { id: 'adivinanza', name: '🤔 Угадай слово', desc: 'Угадывание по описанию' },
    { id: 'batalla', name: '⚔️ Battaglia глаголов', desc: 'Кто больше глаголов вспомнит?' },
    { id: 'charadas', name: '🎪 Charadas', desc: 'Мимика и описание без слова' }
  ];

  return (
    <div className="menu-container">
      <h1>🎮 Juegos para aprender español</h1>
      <p className="subtitle">Elige un juego para jugar con tu compañero</p>
      
      <div className="games-grid">
        {games.map(game => (
          <div key={game.id} className="game-card" onClick={() => onSelectGame(game.id)}>
            <h3>{game.name}</h3>
            <p>{game.desc}</p>
            <button>Jugar</button>
          </div>
        ))}
      </div>

      <button className="admin-btn" onClick={onAdminClick}>
        👨‍🏫 Administrador
      </button>
    </div>
  );
}

// ============ КОНТЕЙНЕР ИГРЫ ============

function GameContainer({ socket, gameType, onBack }) {
  const [gameId, setGameId] = useState(null);
  const [playerRole, setPlayerRole] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameData, setGameData] = useState(null);
  const [roomCode, setRoomCode] = useState(null);
  const [scores, setScores] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    socket?.emit('create_game', gameType);

    socket?.on('game_created', ({ gameId, roomCode }) => {
      setGameId(gameId);
      setRoomCode(roomCode);
      setPlayerRole('player1');
    });

    socket?.on('player_joined', ({ playerCount }) => {
      if (playerCount === 2) {
        setPlayerRole('player1');
      }
    });

    socket?.on('game_started', ({ gameData, gameType }) => {
      setGameStarted(true);
      setGameData(gameData);
    });

    socket?.on('scores_updated', (newScores) => {
      setScores(newScores);
    });

    socket?.on('error', ({ message }) => {
      setError(message);
    });

    return () => {
      socket?.off('game_created');
      socket?.off('player_joined');
      socket?.off('game_started');
      socket?.off('scores_updated');
      socket?.off('error');
    };
  }, [socket, gameType]);

  if (!gameId) {
    return <div className="loading">Создание игры...</div>;
  }

  if (!gameStarted) {
    return <WaitingRoom gameId={gameId} roomCode={roomCode} socket={socket} playerRole={playerRole} />;
  }

  const renderGame = () => {
    switch(gameType) {
      case 'tabu':
        return <TabuGame socket={socket} gameId={gameId} gameData={gameData} playerRole={playerRole} />;
      case 'conjugacion':
        return <ConjugacionGame socket={socket} gameId={gameId} gameData={gameData} playerRole={playerRole} />;
      case 'palabrasPorTema':
        return <PalabrasPorTemaGame socket={socket} gameId={gameId} gameData={gameData} playerRole={playerRole} />;
      case 'dialogos':
        return <DialogosGame socket={socket} gameId={gameId} playerRole={playerRole} />;
      case 'roleplay':
        return <RoleplayGame socket={socket} gameId={gameId} playerRole={playerRole} />;
      case 'preguntas':
        return <PreguntasGame socket={socket} gameId={gameId} playerRole={playerRole} />;
      case 'encadenamiento':
        return <EncadenamientoGame socket={socket} gameId={gameId} playerRole={playerRole} />;
      case 'adivinanza':
        return <AdivinanzaGame socket={socket} gameId={gameId} playerRole={playerRole} />;
      case 'batalla':
        return <BatallaGame socket={socket} gameId={gameId} playerRole={playerRole} />;
      case 'charadas':
        return <CharadasGame socket={socket} gameId={gameId} playerRole={playerRole} />;
      default:
        return <div>Игра не найдена</div>;
    }
  };

  return (
    <div className="game-container">
      <button className="back-btn" onClick={onBack}>← Назад</button>
      <div className="scores-display">
        {Object.entries(scores).map(([id, score]) => (
          <div key={id} className="score">
            <span>Игрок</span>: <strong>{score}</strong>
          </div>
        ))}
      </div>
      {error && <div className="error">{error}</div>}
      {renderGame()}
    </div>
  );
}

// ============ КОМНАТА ОЖИДАНИЯ ============

function WaitingRoom({ gameId, roomCode, socket, playerRole }) {
  const [playerCount, setPlayerCount] = useState(1);
  const [secondPlayerJoined, setSecondPlayerJoined] = useState(false);

  useEffect(() => {
    socket?.on('player_joined', ({ playerCount }) => {
      setPlayerCount(playerCount);
      if (playerCount === 2) {
        setSecondPlayerJoined(true);
      }
    });

    return () => socket?.off('player_joined');
  }, [socket]);

  return (
    <div className="waiting-room">
      <h2>⏳ Ожидание второго игрока</h2>
      <div className="room-code">
        <p>Код комнаты:</p>
        <h1>{roomCode}</h1>
      </div>
      <p className="player-count">Игроки онлайн: {playerCount}/2</p>
      
      {secondPlayerJoined && (
        <div>
          <p className="success">✅ Оба игрока готовы!</p>
          <button 
            className="start-btn" 
            onClick={() => socket?.emit('start_game', gameId)}
          >
            Начать игру
          </button>
        </div>
      )}
    </div>
  );
}

// ============ ИГРА: ТАБУ ============

function TabuGame({ socket, gameId, gameData, playerRole }) {
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [timer, setTimer] = useState(30);
  const [round, setRound] = useState(1);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [skipped, setSkipped] = useState(0);

  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => setTimer(t => t - 1), 1000);
      return () => clearInterval(interval);
    }
  }, [timer]);

  const getCurrentTask = () => {
    const tasksForPlayer = playerRole === 'player1' 
      ? gameData.player1Tasks 
      : gameData.player2Tasks;
    return tasksForPlayer[currentTaskIndex];
  };

  const currentTask = getCurrentTask();

  const handleCorrect = () => {
    socket?.emit('update_score', gameId, 1);
    setCorrectAnswers(c => c + 1);
    nextTask();
  };

  const handleSkip = () => {
    setSkipped(s => s + 1);
    nextTask();
  };

  const nextTask = () => {
    if (currentTaskIndex < 9) {
      setCurrentTaskIndex(c => c + 1);
      setTimer(30);
    }
  };

  return (
    <div className="game-tabu">
      <div className="tabu-timer">
        <div className={`timer ${timer < 10 ? 'urgent' : ''}`}>
          {timer}s
        </div>
      </div>

      <div className="tabu-card">
        <h2>{currentTask?.palabra.toUpperCase()}</h2>
        
        <div className="prohibidas">
          <p>🚫 Нельзя использовать:</p>
          <div className="palabras-list">
            {currentTask?.prohibidas?.map((word, i) => (
              <span key={i} className="prohibida">{word}</span>
            ))}
          </div>
        </div>

        <div className="tabu-buttons">
          <button className="btn-correct" onClick={handleCorrect}>
            ✅ Правильно
          </button>
          <button className="btn-skip" onClick={handleSkip}>
            ⏭️ Пропустить
          </button>
        </div>

        <div className="tabu-stats">
          <p>Раунд: {round}/10</p>
          <p>Угадано: {correctAnswers}</p>
          <p>Пропущено: {skipped}</p>
        </div>
      </div>
    </div>
  );
}

// ============ ИГРА: СПРЯЖЕНИЕ ============

function ConjugacionGame({ socket, gameId, gameData, playerRole }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [score, setScore] = useState(0);

  const currentTask = gameData?.tasks[currentIndex];

  const handleSubmit = () => {
    socket?.emit('submit_answer', gameId, {
      action: 'conjugacion_answer',
      question: currentTask?.pregunta,
      answer
    });
    socket?.emit('update_score', gameId, 1);
    setScore(s => s + 1);
    setAnswer('');
    setShowAnswer(false);
    if (currentIndex < gameData.tasks.length - 1) {
      setCurrentIndex(c => c + 1);
    }
  };

  return (
    <div className="game-conjugacion">
      <div className="conjugacion-card">
        <h2>Ответь на вопрос:</h2>
        <p className="pregunta">{currentTask?.pregunta}</p>
        
        <div className="input-group">
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Напиши свой ответ..."
            onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
          />
          <button onClick={handleSubmit}>Отправить</button>
        </div>

        {showAnswer && (
          <div className="answer-hint">
            <p>Пример: {currentTask?.respuesta}</p>
          </div>
        )}
        
        <button className="hint-btn" onClick={() => setShowAnswer(!showAnswer)}>
          💡 Показать подсказку
        </button>

        <div className="progress">
          <p>Вопрос {currentIndex + 1}/{gameData?.tasks?.length}</p>
          <p>Баллы: {score}</p>
        </div>
      </div>
    </div>
  );
}

// ============ ИГРА: СЛОВА ПО ТЕМЕ ============

function PalabrasPorTemaGame({ socket, gameId, gameData, playerRole }) {
  const [words, setWords] = useState([]);
  const [timer, setTimer] = useState(30);
  const [gameOver, setGameOver] = useState(false);

  useEffect(() => {
    if (timer > 0 && !gameOver) {
      const interval = setInterval(() => setTimer(t => t - 1), 1000);
      return () => clearInterval(interval);
    } else if (timer === 0) {
      setGameOver(true);
      socket?.emit('update_score', gameId, words.length);
    }
  }, [timer, gameOver, socket, gameId, words.length]);

  const currentTask = gameData?.tasks[0];

  const handleAddWord = (word) => {
    if (word.trim() && !words.includes(word.trim())) {
      setWords([...words, word.trim()]);
    }
  };

  return (
    <div className="game-palabras">
      <div className="tema-card">
        <h2>📚 Тема: {currentTask?.tema}</h2>
        
        <div className={`timer-large ${timer < 10 ? 'urgent' : ''}`}>
          {timer}s
        </div>

        {!gameOver ? (
          <div className="words-input">
            <input
              type="text"
              placeholder="Напиши слово..."
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleAddWord(e.target.value);
                  e.target.value = '';
                }
              }}
              disabled={gameOver}
            />
          </div>
        ) : (
          <div className="game-over">
            <h3>⏹️ Время вышло!</h3>
            <p>Ты написал {words.length} слов</p>
          </div>
        )}

        <div className="words-list">
          {words.map((word, i) => (
            <span key={i} className="word-badge">{word}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============ ИГРА: ДИАЛОГИ ============

function DialogosGame({ socket, gameId, playerRole }) {
  const scenarios = [
    { tema: 'Заказ в кафе', frases: ['¿Qué tomas?', 'Yo tomo un café con leche'] },
    { tema: 'Магазин одежды', frases: ['¿Cuál es tu talla?', 'Soy talla M'] },
    { tema: 'Дом', frases: ['¿Dónde vives?', 'Vivo en Barcelona'] }
  ];

  const [dialogIndex, setDialogIndex] = useState(0);
  const [userResponse, setUserResponse] = useState('');
  const [round, setRound] = useState(1);

  const currentScenario = scenarios[dialogIndex];

  const handleResponse = () => {
    socket?.emit('submit_answer', gameId, {
      action: 'dialogo_response',
      scenario: currentScenario.tema,
      response: userResponse
    });
    socket?.emit('update_score', gameId, 1);
    setUserResponse('');
    
    if (round < 3) {
      setRound(r => r + 1);
    } else if (dialogIndex < scenarios.length - 1) {
      setDialogIndex(d => d + 1);
      setRound(1);
    }
  };

  return (
    <div className="game-dialogos">
      <div className="dialogo-card">
        <h2>💬 {currentScenario?.tema}</h2>
        <p className="frase">Partner: "{currentScenario?.frases[0]}"</p>
        
        <div className="response-input">
          <input
            type="text"
            value={userResponse}
            onChange={(e) => setUserResponse(e.target.value)}
            placeholder="Ответь по-испански..."
            onKeyPress={(e) => e.key === 'Enter' && handleResponse()}
          />
          <button onClick={handleResponse}>Отправить</button>
        </div>

        <div className="progress">
          <p>Раунд {round}/3</p>
          <p>Сценарий {dialogIndex + 1}/{scenarios.length}</p>
        </div>
      </div>
    </div>
  );
}

// ============ ИГРА: ROLEPLAY ============

function RoleplayGame({ socket, gameId, playerRole }) {
  const scenarios = [
    { 
      name: '☕ В кафе',
      roles: { player1: 'Клиент', player2: 'Официант' },
      prompts: { player1: 'Заказать кофе и пастель', player2: 'Рекомендовать специальное блюдо' }
    },
    {
      name: '🛍️ В магазине',
      roles: { player1: 'Продавец', player2: 'Клиент' },
      prompts: { player1: 'Предложить помощь', player2: 'Ищешь синюю рубашку' }
    },
    {
      name: '🏠 На улице (встреча)',
      roles: { player1: 'Сосед', player2: 'Сосед' },
      prompts: { player1: 'Спросить как дела', player2: 'Рассказать о своём дне' }
    }
  ];

  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [conversation, setConversation] = useState([]);
  const [input, setInput] = useState('');
  const [timer, setTimer] = useState(120);

  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => setTimer(t => t - 1), 1000);
      return () => clearInterval(interval);
    }
  }, [timer]);

  const scenario = scenarios[scenarioIndex];
  const myRole = playerRole === 'player1' ? scenario.roles.player1 : scenario.roles.player2;
  const myPrompt = playerRole === 'player1' ? scenario.prompts.player1 : scenario.prompts.player2;

  const handleSendMessage = () => {
    if (input.trim()) {
      setConversation([...conversation, { role: myRole, message: input }]);
      socket?.emit('submit_answer', gameId, {
        action: 'roleplay_message',
        role: myRole,
        message: input
      });
      setInput('');
    }
  };

  return (
    <div className="game-roleplay">
      <div className="roleplay-container">
        <h2>{scenario?.name}</h2>
        <p className="my-role">Ты: <strong>{myRole}</strong></p>
        <p className="prompt">💡 {myPrompt}</p>

        <div className="conversation-box">
          {conversation.map((msg, i) => (
            <div key={i} className={`message ${msg.role === myRole ? 'mine' : 'theirs'}`}>
              <strong>{msg.role}:</strong> {msg.message}
            </div>
          ))}
        </div>

        <div className="input-group">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Напиши реплику..."
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          />
          <button onClick={handleSendMessage}>Отправить</button>
        </div>

        <p className="timer-small">Время: {Math.floor(timer / 60)}:{String(timer % 60).padStart(2, '0')}</p>
      </div>
    </div>
  );
}

// ============ ИГРА: ЛИЧНЫЕ ВОПРОСЫ ============

function PreguntasGame({ socket, gameId, playerRole }) {
  const questions = [
    '¿Cuánto tiempo llevas en Barcelona?',
    '¿Qué te gusta más: la playa o la montaña?',
    '¿Cuál es tu plato favorito?',
    '¿Dónde trabajas o estudias?',
    '¿Qué haces en tu tiempo libre?'
  ];

  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [answered, setAnswered] = useState(false);

  const handleSubmit = () => {
    socket?.emit('submit_answer', gameId, {
      action: 'pregunta_answer',
      question: questions[questionIndex],
      answer
    });
    socket?.emit('update_score', gameId, 1);
    setAnswered(true);
    setTimeout(() => {
      if (questionIndex < questions.length - 1) {
        setQuestionIndex(q => q + 1);
        setAnswer('');
        setAnswered(false);
      }
    }, 1000);
  };

  return (
    <div className="game-preguntas">
      <div className="pregunta-card">
        <h3>Вопрос {questionIndex + 1}/{questions.length}</h3>
        <p className="question">{questions[questionIndex]}</p>
        
        {!answered ? (
          <div>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Напиши свой ответ на испанском..."
            />
            <button onClick={handleSubmit}>Ответить</button>
          </div>
        ) : (
          <p className="success">✅ Спасибо за ответ!</p>
        )}
      </div>
    </div>
  );
}

// ============ ИГРА: ЦЕПОЧКА ============

function EncadenamientoGame({ socket, gameId, playerRole }) {
  const [chain, setChain] = useState([]);
  const [input, setInput] = useState('');
  const [isMyTurn, setIsMyTurn] = useState(playerRole === 'player1');
  const [score, setScore] = useState(0);

  const lastLetter = chain.length > 0 ? chain[chain.length - 1].word.slice(-1).toLowerCase() : '';

  const handleAddWord = () => {
    if (input.trim() && input[0].toLowerCase() === lastLetter) {
      const newChain = [...chain, { word: input, addedBy: playerRole }];
      setChain(newChain);
      socket?.emit('submit_answer', gameId, {
        action: 'encadenamiento_word',
        word: input,
        chain: newChain
      });
      socket?.emit('update_score', gameId, 1);
      setScore(s => s + 1);
      setInput('');
      setIsMyTurn(false);
    } else {
      alert('Слово должно начинаться на букву: ' + lastLetter);
    }
  };

  return (
    <div className="game-encadenamiento">
      <div className="encadenamiento-card">
        <h2>🔗 Цепочка слов</h2>
        
        {chain.length === 0 && (
          <p className="rule">Начните с любого слова. Каждое следующее слово должно начинаться последней буквой предыдущего.</p>
        )}

        <div className="chain-display">
          {chain.map((item, i) => (
            <span key={i} className={`chain-word ${item.addedBy}`}>
              {item.word}
              {i < chain.length - 1 && <span className="arrow">→</span>}
            </span>
          ))}
        </div>

        {chain.length > 0 && (
          <p className="hint">Следующее слово должно начинаться на: <strong>{lastLetter.toUpperCase()}</strong></p>
        )}

        <div className="input-group">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Напиши слово..."
            onKeyPress={(e) => e.key === 'Enter' && handleAddWord()}
          />
          <button onClick={handleAddWord} disabled={!isMyTurn}>Добавить слово</button>
        </div>

        <p>Всего слов: {chain.length} | Баллы: {score}</p>
      </div>
    </div>
  );
}

// ============ ИГРА: УГАДАЙ ============

function AdivinanzaGame({ socket, gameId, playerRole }) {
  const words = ['gato', 'libro', 'ventana', 'coche', 'pizza'];
  const hints = {
    'gato': 'Животное, которое мурлычет',
    'libro': 'Чтение',
    'ventana': 'Через неё видно улицу',
    'coche': 'Машина',
    'pizza': 'Итальянская еда'
  };

  const [wordIndex, setWordIndex] = useState(0);
  const [guess, setGuess] = useState('');
  const [score, setScore] = useState(0);
  const [attempts, setAttempts] = useState(3);

  const handleGuess = () => {
    if (guess.toLowerCase() === words[wordIndex]) {
      socket?.emit('update_score', gameId, 1);
      setScore(s => s + 1);
      setGuess('');
      if (wordIndex < words.length - 1) {
        setWordIndex(w => w + 1);
        setAttempts(3);
      }
    } else {
      setAttempts(a => a - 1);
    }
  };

  return (
    <div className="game-adivinanza">
      <div className="adivinanza-card">
        <h2>🤔 Угадай слово</h2>
        <p className="hint-text">Подсказка: {hints[words[wordIndex]]}</p>
        
        <input
          type="text"
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          placeholder="Напиши слово..."
          onKeyPress={(e) => e.key === 'Enter' && handleGuess()}
        />
        <button onClick={handleGuess}>Угадать</button>

        <p>Попыток осталось: {attempts}</p>
        <p>Баллы: {score}/{words.length}</p>
      </div>
    </div>
  );
}

// ============ ИГРА: БАТАЛЬЯ ============

function BatallaGame({ socket, gameId, playerRole }) {
  const [userWords, setUserWords] = useState([]);
  const [timer, setTimer] = useState(60);
  const [input, setInput] = useState('');
  const [gameEnded, setGameEnded] = useState(false);

  useEffect(() => {
    if (timer > 0 && !gameEnded) {
      const interval = setInterval(() => setTimer(t => t - 1), 1000);
      return () => clearInterval(interval);
    } else if (timer === 0) {
      setGameEnded(true);
      socket?.emit('update_score', gameId, userWords.length);
    }
  }, [timer, gameEnded, socket, gameId, userWords.length]);

  const handleAddWord = () => {
    if (input.trim() && !userWords.includes(input.trim())) {
      setUserWords([...userWords, input.trim()]);
      setInput('');
    }
  };

  return (
    <div className="game-batalla">
      <div className="batalla-card">
        <h2>⚔️ Battaglia глаголов</h2>
        <p>Напиши как можно больше глаголов за 60 секунд</p>

        <div className={`timer-large ${timer < 10 ? 'urgent' : ''}`}>
          {timer}s
        </div>

        {!gameEnded ? (
          <div>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Напиши глагол..."
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleAddWord();
                }
              }}
            />
            <button onClick={handleAddWord}>Добавить</button>
          </div>
        ) : (
          <div className="game-over">
            <h3>⏹️ Время вышло!</h3>
            <p>Ты написал {userWords.length} глаголов</p>
          </div>
        )}

        <div className="words-list">
          {userWords.map((word, i) => (
            <span key={i} className="word-badge">{word}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============ ИГРА: CHARADAS ============

function CharadasGame({ socket, gameId, playerRole }) {
  const words = ['dormir', 'comer', 'bailar', 'conducir', 'nadar'];
  
  const [wordIndex, setWordIndex] = useState(0);
  const [guesses, setGuesses] = useState([]);
  const [guess, setGuess] = useState('');
  const [score, setScore] = useState(0);
  const [isActing, setIsActing] = useState(playerRole === 'player1');

  const handleGuess = () => {
    if (guess.toLowerCase() === words[wordIndex]) {
      socket?.emit('update_score', gameId, 1);
      setScore(s => s + 1);
      setGuess('');
      setGuesses([]);
      if (wordIndex < words.length - 1) {
        setWordIndex(w => w + 1);
        setIsActing(!isActing);
      }
    } else {
      setGuesses([...guesses, guess]);
      setGuess('');
    }
  };

  return (
    <div className="game-charadas">
      <div className="charadas-card">
        <h2>🎪 Charadas</h2>
        
        {isActing ? (
          <div className="acting">
            <h3>Ты показываешь: {words[wordIndex]}</h3>
            <p className="instruction">Показывай мимикой, партнер должен угадать!</p>
          </div>
        ) : (
          <div className="guessing">
            <h3>Твой партнер показывает слово</h3>
            <input
              type="text"
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              placeholder="Угадай слово..."
              onKeyPress={(e) => e.key === 'Enter' && handleGuess()}
            />
            <button onClick={handleGuess}>Отправить</button>
            {guesses.length > 0 && <p>Неправильные попытки: {guesses.join(', ')}</p>}
          </div>
        )}

        <p>Баллы: {score}/{words.length}</p>
      </div>
    </div>
  );
}

// ============ АДМИН-ПАНЕЛЬ ============

function AdminPanel({ socket, onLogout, onLogin }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [view, setView] = useState('games'); // games, tasks
  const [activeGames, setActiveGames] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState('tabu');
  const [newTask, setNewTask] = useState({ palabra: '', prohibidas: '' });

  useEffect(() => {
    socket?.on('admin_authenticated', ({ success }) => {
      if (success) {
        setIsAuthenticated(true);
        socket?.emit('get_active_games');
      }
    });

    socket?.on('active_games_list', (games) => {
      setActiveGames(games);
    });

    socket?.on('tasks_list', (tasksList) => {
      setTasks(tasksList);
    });

    return () => {
      socket?.off('admin_authenticated');
      socket?.off('active_games_list');
      socket?.off('tasks_list');
    };
  }, [socket]);

  const handleLogin = () => {
    onLogin(password);
  };

  const handleLoadTasks = () => {
    socket?.emit('get_tasks', selectedCollection, 'A2');
  };

  const handleAddTask = () => {
    if (newTask.palabra.trim()) {
      socket?.emit('add_task', selectedCollection, {
        palabra: newTask.palabra,
        prohibidas: newTask.prohibidas.split(',').map(w => w.trim()),
        nivel: 'A2'
      });
      setNewTask({ palabra: '', prohibidas: '' });
    }
  };

  const handleDeleteTask = (taskId) => {
    socket?.emit('delete_task', selectedCollection, taskId);
  };

  if (!isAuthenticated) {
    return (
      <div className="admin-login">
        <h2>👨‍🏫 Администратор</h2>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Введи пароль..."
          onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
        />
        <button onClick={handleLogin}>Вход</button>
        <button className="back-btn" onClick={onLogout}>Назад</button>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <h1>👨‍🏫 Админ-панель</h1>
      
      <div className="admin-tabs">
        <button 
          className={view === 'games' ? 'active' : ''} 
          onClick={() => setView('games')}
        >
          Активные игры
        </button>
        <button 
          className={view === 'tasks' ? 'active' : ''} 
          onClick={() => setView('tasks')}
        >
          Управление заданиями
        </button>
      </div>

      {view === 'games' && (
        <div className="admin-section">
          <h2>🎮 Активные игры</h2>
          <button onClick={() => socket?.emit('get_active_games')}>Обновить</button>
          
          <div className="games-list">
            {activeGames.map(game => (
              <div key={game.id} className="game-monitor">
                <h3>{game.type.toUpperCase()}</h3>
                <p>Статус: {game.status}</p>
                <p>Игроков: {Object.keys(game.players).length}</p>
                <p>Баллы: {JSON.stringify(game.scores)}</p>
                <p>История: {game.history.length} событий</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'tasks' && (
        <div className="admin-section">
          <h2>📝 Управление заданиями</h2>

          <div className="collection-select">
            <label>Выберите коллекцию:</label>
            <select value={selectedCollection} onChange={(e) => setSelectedCollection(e.target.value)}>
              <option value="tabu">Табу</option>
              <option value="conjugacion">Спряжение</option>
              <option value="palabrasPorTema">Слова по теме</option>
            </select>
            <button onClick={handleLoadTasks}>Загрузить</button>
          </div>

          <div className="add-task">
            <h3>Добавить новое задание</h3>
            {selectedCollection === 'tabu' && (
              <>
                <input
                  type="text"
                  value={newTask.palabra}
                  onChange={(e) => setNewTask({...newTask, palabra: e.target.value})}
                  placeholder="Слово..."
                />
                <input
                  type="text"
                  value={newTask.prohibidas}
                  onChange={(e) => setNewTask({...newTask, prohibidas: e.target.value})}
                  placeholder="Запретные слова (через запятую)..."
                />
              </>
            )}
            <button onClick={handleAddTask}>Добавить</button>
          </div>

          <div className="tasks-table">
            {tasks.map(task => (
              <div key={task.id} className="task-item">
                <p><strong>{task.palabra || task.pregunta || task.tema}</strong></p>
                {task.prohibidas && <p>Запретные: {task.prohibidas.join(', ')}</p>}
                <button onClick={() => handleDeleteTask(task.id)}>Удалить</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button className="logout-btn" onClick={onLogout}>Выход</button>
    </div>
  );
}
