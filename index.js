const wppconnect = require('@wppconnect-team/wppconnect');
const express = require('express');
const cors = require('cors');
const axios = require("axios");
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');  // Importação correta do FormData
const moment = require('moment');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
var ffmpeg = require('fluent-ffmpeg')
ffmpeg.setFfmpegPath(ffmpegPath)
const bodyParser = require('body-parser');
const { sendInitialMenu, handleInitialMenuResponse, askName, handleNameResponse } = require('./handlers/initialMenu');
const { handleFeedbackRequest, handleFeedbackResponse, handleReceiveFeedback, feedbackSessions, handleYesNoFeedback, handleAwaitingRate, handleAwaitingFeedback } = require('./handlers/feedback');
const { handleParticularConvenio, handleParticularResponse, handleConvenio } = require('./handlers/convenio');
const { handleResponseCotinuarAgendamento, handleResponseAgendarOuFiltrar, handleAwaitingTurno, handleAwaitingDia, restart, handleConfirmarConsulta, handleCancelarConsulta } = require('./handlers/agendamento');
const { handleAfkResponse, awaitingAfkResponse2 } = require('./handlers/afk');
const { detectIntent } = require('./chatgpt');
const OpenAI = require('openai');
const openai = new OpenAI({
  apiKey: "sk-proj-fzzO7kJIpX1x4JeUoqatT3BlbkFJKY7h9DWf2PkhU6g4s9fI"
});
const app = express();
const port = 4000;
const sessions = {};
const pollingConnectInterval = 60000;


app.use(bodyParser.json());
app.use(cors());
let client;

const adminSessions = {};
const userTimeouts = {};
const userSessions = {};


let isPhoneConnected = false;

let previousAppointments = [];
const pollingInterval = 1 * 30 * 100;
let existingAdmins = new Set();


// Função para transcrever o áudio
async function transcribeAudio(audioBase64) {
  try {
    // Remove o prefixo "data:audio/ogg;base64," se presente
    const base64Data = audioBase64.split(',')[1] || audioBase64;
    const oggBuffer = Buffer.from(base64Data, 'base64');
    console.log('Tamanho do buffer OGG:', oggBuffer.length);
    const tempOggPath = path.resolve(__dirname, 'temp_audio.ogg');
    const tempMp3Path = path.resolve(__dirname, 'temp_audio.mp3');

    console.log('Iniciando conversão para MP3...');
    // Salva o arquivo OGG localmente
    fs.writeFileSync(tempOggPath, oggBuffer);
    console.log('Arquivo OGG salvo em:', tempOggPath);
    console.log('Conteúdo do arquivo OGG:', fs.readFileSync(tempOggPath).slice(0, 100)); // Exibe os primeiros 100 bytes do arquivo

  
  // Convertendo o arquivo OGG para MP3
  await new Promise((resolve, reject) => {
    const mp3Stream = fs.createWriteStream(tempMp3Path);
    ffmpeg()
      .input(tempOggPath)
      .toFormat("mp3")
      .on('end', () => {
        console.log('Conversão concluída!');
        resolve();
      })
      .on('error', (err) => {
        console.error('Erro durante a conversão:', err);
        reject(err);
      })
      .pipe(mp3Stream, {end: true})
  });

  // Verifica se o arquivo MP3 foi criado com sucesso
  if (!fs.existsSync(tempMp3Path)) {
    console.error("Erro: Arquivo MP3 não foi criado.");
    return null;
  }

  console.log('Iniciando transcrição...');
// Verifique o conteúdo do arquivo MP3 gerado
console.log('Conteúdo do arquivo MP3 (primeiros 100 bytes):', fs.readFileSync(tempMp3Path).slice(0, 100));

    const response = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempMp3Path),
      model: "whisper-1",
      response_format: "text",
  })
  fs.unlinkSync(tempOggPath);
  fs.unlinkSync(tempMp3Path);
  console.log(response)
    return response;
  } catch (error) {
    console.error('Erro ao transcrever áudio:', error);
    return null;
  }
}


async function getAdmins() {
  try {
    const response = await axios.get('https://newtoo.space/admin');
    return response.data;
  } catch (error) {
    console.error('Erro ao buscar admins:', error);
    return [];
  }
}

async function checkForNewAdmins() {
  const admins = await getAdmins();
  if (admins.length > 0) { // Se houver pelo menos um admin
    const firstAdmin = admins[0]; // Pega apenas o primeiro admin
    
    if (!existingAdmins.has(firstAdmin.id)) {
      existingAdmins.add(firstAdmin.id);
      await createSession(firstAdmin); // Cria apenas uma sessão
      console.log("✅ Sessão criada para o primeiro admin encontrado.");
    } else {
      console.log("⚠️ Sessão já criada anteriormente.");
    }
  } else {
    console.log("🚫 Nenhum admin encontrado.");
  }
}

function startPolling() {
  setInterval(checkForNewAdmins, pollingInterval);
}

startPolling();

setInterval(async () => {
  for (let adminId in adminSessions) {
    const client = adminSessions[adminId];

    if (!client || !client.isConnected()) {
      console.warn(`🔄 Cliente desconectado (${adminId}), tentando recriar a sessão...`);

      try {
        // Tenta recriar a sessão do admin
        await createSession({ id: adminId });
        console.log(`✅ Sessão recriada com sucesso para ${adminId}`);
      } catch (error) {
        console.error(`❌ Erro ao reiniciar sessão para ${adminId}:`, error);
      }
    }
  }
}, 2 * 60 * 60 * 1000); // Executa a cada 5 minutos

async function checkForQueueUpdates(client, adminId) {
  try {
    const currentAppointments = await fetchAppointments(adminId);
    if (JSON.stringify(currentAppointments) !== JSON.stringify(previousAppointments)) {
      notifyUsersOfQueueChanges(client, currentAppointments);
      previousAppointments = currentAppointments;
    }
  } catch (error) {
    console.error("Error fetching appointments:", error);
  }
}


async function fetchAppointments(adminId) {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = today.getFullYear();

  const formattedDate = `${year}-${month}-${day}`;


  try {
    const url = `https://newtoo.space/schedules/${adminId}?date=${formattedDate}`;
    console.log(url);
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error('Erro ao buscar consultas:', error);
    return [];
  }
}

function formatWhatsAppNumber(number) {
  // Remove todos os caracteres não numéricos
  const cleanedNumber = number.replace(/\D/g, ''); 

  // Valida o comprimento do número
  if (cleanedNumber.length < 10 || cleanedNumber.length > 13) {
    throw new Error(`Número inválido: ${number}`);
  }

  // Adiciona o código do país (55) se estiver ausente
  let formattedNumber = cleanedNumber.startsWith('55') 
    ? cleanedNumber 
    : `55${cleanedNumber}`;

  // Remove o "9" excedente após o código do país, se houver
  const withoutExcessNine = formattedNumber.replace(/^55(\d{2})(9)(\d{8})$/, '55$1$3');

  return `${withoutExcessNine}@c.us`;
}


function notifyUsersOfQueueChanges(client, currentAppointments) {
  const now = new Date();

  // Agrupe os agendamentos por profissional
  const appointmentsByProfessional = currentAppointments.reduce((acc, appointment) => {
    const professionalId = appointment.professionalId;
    if (!acc[professionalId]) {
      acc[professionalId] = [];
    }
    acc[professionalId].push(appointment);
    return acc;
  }, {});

  Object.values(appointmentsByProfessional).forEach((appointments) => {
    // Ordene as consultas por horário de início
    appointments.sort((a, b) => {
      const timeA = new Date(`${a.day}T${a.start}:00`).getTime();
      const timeB = new Date(`${b.day}T${b.start}:00`).getTime();
      return timeA - timeB;
    });

    appointments.forEach((appointment, index) => {
      const previousIndex = previousAppointments.findIndex(a => a.id === appointment.id);
      const newPosition = index + 1;
      const whatsappRaw = appointment.patientInfo.whatsapp;

      // Formate o número para o formato correto
      let whatsapp;
      try {
        whatsapp = formatWhatsAppNumber(whatsappRaw);
      } catch (error) {
        console.error(`Erro ao formatar o número: ${error.message}`);
        return; // Pule para o próximo número se houver erro
      }

      const startTime = new Date(`${appointment.day}T${appointment.start}:00`);
      const waitTime = Math.max(0, Math.round((startTime - now) / 60000));

      // Convertendo o tempo de espera para horas se for superior a 60 minutos
      let displayWaitTime = waitTime > 60 
        ? `${Math.round(waitTime / 60)} horas` 
        : `${waitTime} minutos`;


      if (previousIndex === -1) {
        if (newPosition === 1) {
          client.sendText(whatsapp, `Oba! Você é o próximo a ser atendido. Por favor, esteja preparado para ser chamado em aproximadamente ${displayWaitTime}.`);
        } else {
          client.sendText(whatsapp, ` Olá! Você acabou de entrar na nossa fila de atendimento. Ela serve para manter a transparência de quantos minutos realmente faltam para o seu atendimento e quantas pessoas estão na frente para que você possa se organizar da melhor forma possível. Por sinal, Sua posição atual é número ${newPosition}. O tempo de espera previsto é de aproximadamente ${displayWaitTime}.`);
        }
      } else if (previousIndex !== index) {
        if (newPosition === 1) {
          client.sendText(whatsapp, `Sua hora chegou! \n Você é o próximo a ser atendido. Te chamaremos dentro de alguns instantes.`);
        } else if (previousIndex > index) {
          client.sendText(whatsapp, `Sua posição na fila mudou. Agora você é o número ${newPosition}. O tempo de espera previsto é de aproximadamente ${displayWaitTime}.`);
        } else if (previousIndex < index) {
          client.sendText(whatsapp, `Infelizmente, uma pessoa em estado de urgência teve que ser atendida nesse momento. Sua nova posição na fila é ${newPosition}. O tempo de espera previsto é de aproximadamente ${displayWaitTime}.`);
        }
      }
    });
  });
}

const updateSchedule = async (id, updateScheduleDto) => {
  try {
    const response = await axios.patch(`https://newtoo.space/schedules/${id}`, updateScheduleDto);
    console.log('Resposta:', response.data);
    return response.data;
  } catch (error) {
    console.error('Erro ao atualizar o agendamento:', error.response || error.message);
    throw error;  
  }
};

const sendReminder = async (patient, appointmentDate, client, whatsappNumber, appointmentId, reminderSent) => {
 // console.log(`[REMINDER] Enviando lembrete para ${patient?.name || 'desconhecido'} na data ${appointmentDate} e o reminder é ${reminderSent}`);

  try {
    const currentDate = new Date();
    const appointmentTime = new Date(appointmentDate);
    const dayBefore = new Date(appointmentTime);
    dayBefore.setDate(appointmentTime.getDate() - 1);

    const sendMessage = async (message, phone) => {
      console.log(`[REMINDER] Enviando mensagem para ${phone}: ${message}`);
      await client.sendText(phone, message);
    };

    // Verificar se o lembrete de amanhã já foi enviado
    const dayBeforeSent = reminderSent === "daybeforeSent";
    if (currentDate.toDateString() === dayBefore.toDateString() && !dayBeforeSent) {
      const message = `Olá ${patient.name}, seu atendimento está confirmado para amanhã, ${appointmentTime.toLocaleDateString()} às ${appointmentTime.toLocaleTimeString()} aqui na clínica.\n Nossa equipe já está deixando tudo pronto para te atender da melhor forma possível. Para que possamos reservar esse horário exclusivo para voce, por favor responda com "confirmar". Caso não tenha como comparecer amanhã por conta de algum imprevisto responda com "cancelar" para que possamos encontrar outro horário melhor para te atender.`;
      await sendMessage(message, whatsappNumber);
      // Atualizando reminderSent para "daybeforeSent"
      await updateSchedule(appointmentId, { reminderSent: "daybeforeSent" });
    }

    // Verificar se o lembrete de hoje já foi enviado
    const todaySent = reminderSent === "daysent";
    const fiveMinutesSent = reminderSent === "fiveminutesSent";
    if (currentDate.toDateString() === appointmentTime.toDateString() && !todaySent && !fiveMinutesSent) {
      const message = `Olá ${patient.name}, passando aqui para lembrar do seu atendimento que está agendado para hoje, ${appointmentTime.toLocaleTimeString()}.\n\nQualquer dúvida que tiver, nos mantemos á disposição para te ajudar.`;
      await sendMessage(message, whatsappNumber);
      // Atualizando reminderSent para "daysent"
      await updateSchedule(appointmentId, { reminderSent: "daysent" });
    }

    // Verificar se o lembrete de 5 minutos antes já foi enviado
    const fiveMinutesBefore = new Date(appointmentTime);
    fiveMinutesBefore.setMinutes(appointmentTime.getMinutes() - 5);
    
    if (
      currentDate.toDateString() === fiveMinutesBefore.toDateString() &&
      currentDate.getHours() === fiveMinutesBefore.getHours() &&
      currentDate.getMinutes() === fiveMinutesBefore.getMinutes() && !fiveMinutesSent
    ) {
      const message = `Olá ${patient.name}, os preparativos estão sendo feitos e o seu atendimento começa em 5 minutos! Aproveite esse tempinho para se preparar e ficar confortável. Até já!`;
      await sendMessage(message, whatsappNumber);
      // Atualizando reminderSent para "fiveminutesSent"
      await updateSchedule(appointmentId, { reminderSent: "fiveminutesSent" });
    }
  } catch (error) {
    console.error(`[REMINDER] Erro ao enviar lembrete para ${patient?.name || 'desconhecido'}:`, error);
  }
};

async function reminderLoop(client, adminId) {
 // console.log(`[REMINDER] Executando reminderLoop para adminId: ${adminId}`);

  // Data de hoje e amanhã
  const today = moment().format('YYYY-MM-DD');
  const tomorrow = moment().add(1, 'day').format('YYYY-MM-DD');

  try {
    // Buscar agendamentos para hoje e amanhã
    const response = await axios.get(`https://newtoo.space/schedules/${adminId}?startDate=${today}&endDate=${tomorrow}`);
    const appointments = response.data;

 //   console.log(`[REMINDER] Agendamentos retornados:`, appointments);

    for (const appointment of appointments) {
      const appointmentDate = moment(`${appointment.day}T${appointment.start}`).toDate();
      const patient = appointment.patientInfo;
      const reminderSent = appointment.reminderSent;
      const whatsapp = patient.whatsapp;
      const whatsappNumber = formatWhatsAppNumber(whatsapp);

      // Chama a função sendReminder para cada agendamento
      await sendReminder(patient, appointmentDate, client, whatsappNumber, appointment.id, reminderSent);
    }
  } catch (error) {
    console.error(`[REMINDER] Erro ao buscar ou processar agendamentos:`, error.message);
  }
}
const startReminderService = (client, adminId) => {
  setInterval(() => {
    reminderLoop(client, adminId);
  }, 60000); 
};


let qrCodeImagePath = '';

function sendInactivityMessage(client, from, adminId) {
  if (!userSessions[adminId][from]) {
    userSessions[adminId][from] = {};
  }

  client.sendText(from, `Notamos que você ainda não respondeu! Precisa de ajuda?\n\n1️⃣ || Não, vou continuar\n2️⃣ || Estou com dificuldades\n3️⃣ || Prefiro atendimento humano`);
  userSessions[adminId][from].step = 'awaiting_afk_response';
}

app.get('/checkPhoneStatus', async (req, res) => {
  if (isPhoneConnected != 'notLogged' && isPhoneConnected != 'disconnected') {
    res.json({ status: "connected" });
  } else {
    res.json({ status: 'disconnected' });
  }
});
app.get('/qr-code', (req, res) => {
  if (qrCodeImagePath) {
    res.send({ qrCode: qrCodeImagePath });
  } else {
    res.status(404).send({ error: 'QR Code not available yet' });
  }
});

app.post('/disconnect', async (req, res) => {
  try {
    await client.logout();
    isPhoneConnected = 'disconnected';

    res.json({ status: 'disconnected' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

function formatPhoneNumber(number) {
  // Remove espaços, caracteres especiais e verifica se é um número válido
  const cleanedNumber = number.replace(/\D/g, ''); // Remove tudo que não for número

  // Verifica se o número já está no formato correto
  if (cleanedNumber.endsWith('@c.us')) {
    return cleanedNumber;
  }

  // Remove o prefixo "+" caso exista
  const formattedNumber = cleanedNumber.startsWith('55')
    ? cleanedNumber
    : `55${cleanedNumber}`;

  // Adiciona o sufixo "@c.us"
  return `${formattedNumber}@c.us`;
  console.log(`${formattedNumber}@c.us`)
}

app.post('/send-text', async (req, res) => {
  const { number, message } = req.body;
  console.log(req.body)

  if (!number || !message) {
    return res.status(400).send({ error: 'Número e mensagem são obrigatórios' });
  }

  console.log('Número recebido:', number);
const formattedNumber = formatPhoneNumber(number);
console.log('Número formatado:', formattedNumber);


  try {
    await client
      .sendText(formattedNumber, message)
      .then((result) => {
        console.log('Result: ', result);
        res.status(200).send({ success: true, message: 'Mensagem enviada com sucesso' });
      })
      .catch((erro) => {
        console.error('Error when sending: ', erro);
      });
  } catch (error) {
    console.error('Erro ao enviar a mensagem:', error);
    res.status(500).send({ success: false, message: 'Erro ao enviar a mensagem', error: error.message });
  }
});

app.post('/request-feedback', async (req, res) => {
  const { number, professionalId, patientId, adminId } = req.body;

  if (!number) {
    return res.status(400).send({ error: 'Número é obrigatório' });
  }

  if (!professionalId) {
    return res.status(400).send({ error: 'professionalId é obrigatório' });
  }

  if (!patientId) {
    return res.status(400).send({ error: 'patientId é obrigatório' });
  }

  if (!adminId) {
    return res.status(400).send({ error: 'adminId é obrigatório' });
  }

  console.log('Número recebido:', number);
const formattedNumber = formatPhoneNumber(number);
console.log('Número formatado:', formattedNumber);

  if (!userSessions[adminId][formattedNumber]) {
    userSessions[adminId][formattedNumber] = { feedback: {}, step: 'initial' };
  } else if (!userSessions[adminId][formattedNumber].feedback) {
    userSessions[adminId][formattedNumber].feedback = {};
  }


  try {
    userSessions[adminId][formattedNumber].feedback.professionalId = professionalId;
    userSessions[adminId][formattedNumber].feedback.patientId = patientId;
    console.log(userSessions)

    await handleFeedbackRequest(client, formattedNumber, adminId, userSessions);
    res.status(200).send({ success: true, message: 'Solicitação de feedback enviada com sucesso' });
  } catch (error) {
    console.error('Erro ao solicitar feedback:', error);
    res.status(500).send({ success: false, message: 'Erro ao solicitar feedback', error: error.message });
  }
});

app.get("/in-attendance/:adminId", async (req, res) => {
  const adminId = req.params.adminId;
  if (!adminId) {
    return res.status(400).send({ error: 'adminId é obrigatório' });
  }

  if (userSessions[adminId]) {
    res.status(200).send({ success: true, total: Object.keys(userSessions[adminId]).length || 0 })
  } else {
    res.status(200).send({ success: true, total: 0 })
  }
})

app.post('/confirm-appointment', async (req, res) => {
  const { number, appointmentId, patientName, professionalName, start, end, adminId } = req.body;

  if (!number) {
    return res.status(400).send({ error: 'Número é obrigatório' });
  }

  if (!appointmentId) {
    return res.status(400).send({ error: 'appointmentId é obrigatório' });
  }

  if (!patientName) {
    return res.status(400).send({ error: 'Nome do paciente é obrigatório' });
  }

  if (!professionalName) {
    return res.status(400).send({ error: 'Nome do profissional é obrigatório' });
  }

  if (!start) {
    return res.status(400).send({ error: 'Hora de início é obrigatória' });
  }

  if (!end) {
    return res.status(400).send({ error: 'Hora de término é obrigatória' });
  }

  if (!adminId) {
    return res.status(400).send({ error: 'adminId é obrigatório' });
  }

  console.log('Número recebido:', number);
const formattedNumber = formatPhoneNumber(number);
console.log('Número formatado:', formattedNumber);

  try {
    if (!userSessions[adminId][formattedNumber]) {
      userSessions[adminId][formattedNumber] = { step: 'initial', appointment: {} };
    }
    userSessions[adminId][formattedNumber].appointment = {
      id: appointmentId,
      patientName,
      professionalName,
      start,
      end,
    };

    await client.sendText(formattedNumber, `Olá, ${patientName}! tudo bem? Nos encontramos de novo.\nTemos sua consulta confirmada para amanhã com o doutor ${professionalName} ${start} ás ${end}! tudo certo?\n\n1️⃣ Sim\n2️⃣ Não`);

    userSessions[adminId][formattedNumber].step = 'awaiting_schedule_confirmation'

    res.status(200).send({ success: true, message: 'Pedido de confirmação de consulta enviado com sucesso' });
  } catch (error) {
    console.error('Erro ao confirmar consulta:', error);
    res.status(500).send({ success: false, message: 'Erro ao confirmar consulta', error: error.message });
  }
});

function ativarAtendimentoHumano(adminId, from) {
  if (!userSessions[adminId][from]) return;

  userSessions[adminId][from].atendenteHumano = true;
  console.log(`🤖 Atendimento humano ativado para ${from}. Chatbot pausado por 30 minutos.`);

  setTimeout(() => {
      userSessions[adminId][from].atendenteHumano = false;
      console.log(`✅ Chatbot reativado para ${from}.`);
  }, 30 * 60 * 1000); // 30 minutos
}

const pendingMessages = {}; // Armazena mensagens temporariamente

const DEBOUNCE_TIME = 7000; // 1 segundo de espera antes de processar

const startListeningToMessages = (adminId, client) => {
  client.onMessage(async (message) => {
    console.log(JSON.stringify(message, null, 2));

    const { from, body, isGroupMsg, type } = message;
    console.log(type)
    let messageContent = body;

    if (message.from === "status@broadcast") {
      console.log("Mensagem de status ignorada.");
      return;
    }

    if (type === 'audio' || type === 'ptt') {
      try {
        const audioBase64 = await client.downloadMedia(message);
        console.log('Áudio baixado com sucesso.');

        // Log do tipo de mídia
    console.log('Tipo de áudio:', typeof audioBase64);
    console.log('Conteúdo base64 do áudio (primeiros 100 caracteres):', audioBase64.slice(0, 100));

        // Transcreve o áudio
        const transcription = await transcribeAudio(audioBase64);
        if (transcription) {
          console.log('Transcrição do áudio:', transcription);
          messageContent = transcription; // Substitui o corpo pela transcrição
        } else {
          console.error('Falha ao transcrever o áudio.');
        }
      } catch (error) {
        console.error('Erro ao processar o áudio:', error);
      }
    }

   

    if (!isGroupMsg ) {
      if (!userSessions[adminId]) {
        userSessions[adminId] = {};
      }

      if (!userSessions[adminId][from]) {
        userSessions[adminId][from] = {
          step: 'chatgpt',
          context: '',  // Armazena o contexto acumulado
          professionalId: null,
          date: null,
          shift: null,
          procedureId: null,
          valor: null,
          idConsulta: null,
          idUnidade: null,
          nascimento: null,
          cpf: null,
          name: null,
          convenioId: null,
          idAgenda: null,
          dataAgenda: null,
          horaAgenda: null,
          agendado: false,
          atendenteHumano: false
        };
      }

      const isConnected = await client.isConnected();
if (!isConnected) {
    console.log("❌ Sessão desconectada. Tentando reconectar...");
    await client.restartService();
}


      const userSession = userSessions[adminId][from];

      if (userSession.atendenteHumano) {
        console.log(`🛑 Atendimento humano ativo para ${from}. Ignorando mensagens.`);
        return;
    }

    if (type === 'image' || type ===  'document' || type ===  'video'){
      await client.addOrRemoveLabels(from, [{labelId: '7' , type:'add'}]);
    
      await client.sendText(from, "✅ Aguarde um instante, você foi transferido para um atendente humano.");
      ativarAtendimentoHumano(adminId, from)
      return
  }

    if (userSessions[adminId][from].agendado) {
      console.log("⚠️ RESETANDO SESSÃO! Detalhes da sessão antes do reset:", userSessions[adminId][from]);
      console.log("🔄 Resetando userSession pois a consulta foi agendada...");
    
      userSessions[adminId][from] = {
        step: 'chatgpt',
        context: '',
        professionalId: null,
        date: null,
        shift: null,
        procedureId: null,
        valor: null,
        idConsulta: null,
        idUnidade: null,
        nascimento: null,
        cpf: null,
        name: null,
        convenioId: null,
        idAgenda: null,
        dataAgenda: null,
        horaAgenda: null,
        agendado: false, // Resetando
        atendenteHumano: false
      };
    
      console.log("✅ userSession resetado com sucesso!");
    }

       // Inicializa a fila de mensagens pendentes
    if (!pendingMessages[from]) {
      pendingMessages[from] = [];
    }

    // Adiciona a nova mensagem ao array de mensagens pendentes
    if (!pendingMessages[from].includes(body)) {
      pendingMessages[from].push(body);
    }
    

    // Se já existir um timer, limpa antes de reiniciar
    if (pendingMessages[from].timer) {
      clearTimeout(pendingMessages[from].timer);
    }
    
    // Configura um novo timer para processar todas as mensagens juntas
    pendingMessages[from].timer = setTimeout(async () => {
      // Junta todas as mensagens acumuladas em uma única string
      const combinedMessage = pendingMessages[from].join(' ');
      pendingMessages[from] = []; // Limpa as mensagens acumuladas

      console.log(`📩 Mensagem consolidada: "${combinedMessage}"`);

      // 🔍 Verifica o step **antes de processar a resposta**
      if (userSession.step === 'chatgpt') {
        userSession.context += `Usuário: ${combinedMessage}\n`;
        if(combinedMessage.toLowerCase().includes('atendimento humano')){
          ativarAtendimentoHumano(adminId, from);
          await client.sendText(from, "✅ Você foi transferido para um atendente humano. O chatbot ficará inativo por 30 minutos.");
          return;
        }
        console.log("to mandando pro gpt agora...")
        const response = await detectIntent(combinedMessage, adminId, userSession, client, from);
        console.log("A resposta é essa:", response)
        userSession.context += `Assistente: ${response}\n`;
        console.log("O contexto atualizado:", userSession.context)

        await client.sendText(from, response);
      } else {
        console.log(`🔕 Ignorando mensagem porque step = ${userSession.step}`);
      }
    }, DEBOUNCE_TIME); // Aguarda um tempo antes de processar

  
  }

    const session = userSessions[adminId][from];
    const dateAlreadyStored = userSession.date;
    if (!dateAlreadyStored) {
      // Se não, chama a função que lida com a data
      await handleDateResponse(messageContent, userSession, client, from);
    } else {
      // Se já tem data, segue o fluxo normalmente
      await client.sendText(from, `Você já indicou a data para ${userSession.date}. Agora, vamos seguir com o agendamento!`);
    }
    switch (session.step) {
      case 'await_user_response':
        await handleInitialMenuResponse(client, from, messageContent, adminId, userSessions);
        break;
      case 'awaiting_name':
        await handleNameResponse(client, from, messageContent, userSessions, adminId);
        break;
      case 'awaiting_convenio_particular':
        await handleParticularConvenio(client, from, messageContent, adminId, userSessions);
        break;
      case 'awaiting_convenio':
        await handleConvenio(client, from, messageContent, adminId, userSessions);
        break;
      case 'awaiting_particular_select':
        await handleParticularResponse(client, from, message, adminId, userSessions);
        break;
      case 'awaiting_continuar_agendamento':
        await handleResponseCotinuarAgendamento(client, from, messageContent, adminId, userSessions);
        break;
      case 'awaiting_filtrar_ou_agendar':
        await handleResponseAgendarOuFiltrar(client, from, messageContent, adminId, userSessions);
        break;
      case 'awaiting_turno':
        await handleAwaitingTurno(client, from, messageContent, adminId, userSessions);
        break;
      case 'awaiting_dia':
        await handleAwaitingDia(client, from, messageContent, adminId, userSessions);
        break;
      case 'awaiting_restart':
        await restart(client, from, userSessions, adminId, messageContent);
        break;
      case 'awaiting_yes_no_feedback':
        await handleYesNoFeedback(client, from, messageContent, adminId, userSessions);
        break;
      case 'awaiting_rate_feedback':
        await handleAwaitingRate(client, from, messageContent, adminId, userSessions);
        break;
      case 'awaiting_feedback':
        await handleAwaitingFeedback(client, from, messageContent, adminId, userSessions);
        break;
      case 'awaiting_schedule_confirmation':
        await handleConfirmarConsulta(client, from, messageContent, adminId, userSessions);
        break;
      case 'awaiting_cancelar_consulta':
        await handleCancelarConsulta(client, from, messageContent, adminId, userSessions);
        break;
      case 'awaiting_afk_response':
        await handleAfkResponse(client, from, messageContent, adminId, userSessions);
        break;
      case 'awaiting_afk_response_2':
        await awaitingAfkResponse2(client, from, messageContent, adminId, userSessions);
        break;
    }
    // }
  });
};


async function createSession(admin) {
  const adminId = admin.id.toString()
  try {
    const client = await wppconnect.create({
      session: adminId,
      catchQR: (base64Qrimg, asciiQR, attempts, urlCode) => {
        console.log(`QR Code para admin: ${adminId}`);
        console.log(asciiQR);
        console.log(`QR Code ASCII: \n${asciiQR}`)
        console.log(`Base64 do QR Code: ${base64Qrimg.substring(0, 50)}...`);
        if (attempts >= 3) {
          console.log(`Tentativas de QR Code para ${adminId} excedidas.`);
        }
        const qrCodeFilePath = path.join(__dirname, 'qrcodes', `${adminId}.png`);
        const qrCodeBuffer = Buffer.from(base64Qrimg.split(',')[1], 'base64');
        try {
          fs.writeFileSync(qrCodeFilePath, qrCodeBuffer);
          console.log(`QR Code salvo em: ${qrCodeFilePath}`);
        } catch (writeError) {
          console.error(`Erro ao salvar QR Code para admin: ${adminId}`, writeError);
        }
      },
      autoClose: false,
      logLevel: 'verbose',
      puppeteerOptions: {
        args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'],
        protocolTimeout: 120000,
      }
    });
    console.log(`Sessão criada para admin: ${adminId}`);
    adminSessions[adminId] = client;

    startListeningToMessages(adminId, client);
  } catch (error) {
    console.error(`Erro ao criar sessão para admin: ${adminId}`, error);
  }
}

app.get('/check-connection/:adminId', async (req, res) => {
  const adminId = req.params.adminId;

  // if (!adminSessions[adminId]) {
  //   return res.status(404).json({ status: 'Session not found' });
  // }

  const client = adminSessions[adminId];
  if (adminSessions[adminId]?.connected && adminSessions[adminId].connected == true) {
    res.json({ status: 'connected' })
  } else {
    res.json({ status: 'disconnected' })
  }


});

app.post('/disconnect/:adminId', async (req, res) => {
  const adminId = req.params.adminId;

  if (!adminSessions[adminId]) {
    return res.status(404).json({ status: 'Session not found' });
  }

  const client = adminSessions[adminId];

  try {
    await client.logout();
    adminSessions[adminId] = client;
    res.json({ status: 'disconnected' });
  } catch (error) {
    console.error('Error disconnecting:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});


app.get('/qrcode/:adminId', (req, res) => {
  const adminId = req.params.adminId;
  const qrCodeFilePath = path.join(__dirname, 'qrcodes', `${adminId}.png`);
  if (fs.existsSync(qrCodeFilePath)) {
    res.sendFile(qrCodeFilePath);
  } else {
    res.status(404).send('QR Code não encontrado');
  }
});

app.listen(port, () => {
  console.log(`Servidor do chatbot rodando na porta ${port}`);
});