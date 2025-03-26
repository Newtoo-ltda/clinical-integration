require('dotenv').config();
const { sendInitialMenu } = require("./initialMenu")
const axios = require("axios");
const { format, addDays, isValid } = require('date-fns');
const { ptBR } = require('date-fns/locale');

const api = axios.create({
  baseURL: "https://newtoo.space/"
});

const restart = async (client, from,userSessions,adminId, body)=>{
  switch(body){
    case '1':
      delete userSessions[adminId][from]
      await sendInitialMenu(client,from, userSessions,adminId)
      break
    case '2':
      delete userSessions[adminId][from]
      break
    default:
      await client.sendText(from,"Selecione uma opção válida")
      break
    }
}

const handleAgendar = async(client, from, adminId,userSessions)=>{
  const { data: admin } = await api.get(`/admin/${adminId}`)

  const nextDateString = userSessions[adminId][from].nextDate.date;
  const [year, month, day] = nextDateString.split('-').map(Number);
  const nextDate = new Date(Date.UTC(year, month - 1, day)); // Usar Date.UTC para evitar problemas de fuso horário
  const formattedMonth = String(nextDate.getUTCMonth() + 1).padStart(2, '0');
  const formattedDay = String(nextDate.getUTCDate()).padStart(2, '0');
  const formattedDate = `${formattedDay}/${formattedMonth}`;

  try{
    const appointmentData = {
      day: userSessions[adminId][from].nextDate.date,
      start: userSessions[adminId][from].nextDate.start,
      end: userSessions[adminId][from].nextDate.end,
      adminId: +adminId,
      professionalId: +userSessions[adminId][from].nextDate.professionalId,
      status: "scheduled",
      patientInfo: {
        name: userSessions[adminId][from].userName,
        healthInsuranceId: +userSessions[adminId][from].selectedConvenio?.id || null,
        whatsapp: from
      }
    };

    

    if (userSessions[adminId][from].matchingSection === 'agendar procedimento') {
      appointmentData.procedureId = +userSessions[adminId][from].selectedRow.rowId;
    }

   await api.post(`/schedules`, appointmentData)
    await client.sendText(from,'Que ótimo!')
    await client.sendText(from, `Confirmamos o seu procedimento com o ${userSessions[adminId][from].nextDate.professionalName} para o dia ${formattedDate}. O endereço da nossa clínica é na rua ${admin.street} número ${admin.number}`);
    await client.sendText(from,`Será um prazer recebê-lo(a)! Antes enviaremos lembretes de confirmação e da sua posição na fila. Caso não confirme a consulta, ela pode ser cancelada! Fique atento. Posso ajudar em algo mais?\n\n1️⃣ Sim\n2️⃣ Não`)
    userSessions[adminId][from].step = 'awaiting_restart'
  }catch(error){
    if (error.response && error.response.status === 409) {
      await client.sendText(from, 'Desculpe, este horário com o profissional já foi preenchido. Por favor, escolha outro horário.');
      await handleGetFirstDate(client, from,userSessions,adminId, null, null)
    } else {
      console.error("Erro interno do servidor", error);
      await client.sendText(from, 'Ocorreu um erro interno. Por favor, tente novamente mais tarde.');
    }
  }

}

const handleAwaitingDia = async (client, from, body,adminId, userSessions) => {
  const datePattern = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/;

  if (!datePattern.test(body)) {
    await client.sendText(from, 'Por favor, insira a data no formato dd/mm/aaaa.');
    return;
  }

  const [day, month, year] = body.split('/').map(Number);
  const parsedDate = new Date(year, month - 1, day);

  if (!isValid(parsedDate)) {
    await client.sendText(from, 'Por favor, insira uma data válida.');
    return;
  }

  const formattedDate = format(parsedDate, 'yyyy-MM-dd');

  await handleGetFirstDate(client, from, userSessions,adminId,null, formattedDate)
};

const handleAwaitingTurno = async (client,from,body,adminId,userSessions) =>{
  let data = null
  if(userSessions[adminId][from].nextDate){
    data = userSessions[adminId][from].nextDate.date
  }
  switch(body){
    case '1':
      await handleGetFirstDate(client,from,userSessions,adminId,body, data)
      break
    case '2':
      await handleGetFirstDate(client,from,userSessions, adminId,body, data)
      break
    case '3':
      await handleGetFirstDate(client,from,userSessions, adminId,body, data)
      break
    default:
      await client.sendText(from,"Selecione uma opção válida")
      break
    }
}

const handleResponseAgendarOuFiltrar = async (client,from,body,adminId,userSessions) =>{
  switch(body){
    case '1':
    case 'Agendar':
      await handleAgendar(client,from,adminId,userSessions)
      break
    case '2':
    case 'Turno':
      await client.sendText(from,`Se você prefere outro turno, pode nos dizer qual?\n\n1️⃣ || Manhã\n2️⃣ || Tarde\n3️⃣ || Noite`)
      userSessions[adminId][from].step= 'awaiting_turno' 
      break
    case '3':
    case 'Dia':
      await client.sendText(from,'Se você prefere outro dia pode nos dizer qual?(DD/MM/AAAA)')
      userSessions[adminId][from].step= 'awaiting_dia'
      break
    default:
      await client.sendText(from,"Selecione uma opção válida")
      break
    }
}

const convertDateToWrittenFormat = (dateString) => {
  const date = new Date(dateString);
  const correctedDate = addDays(date, 1);
  return format(correctedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
};

const handleResponseCotinuarAgendamento = async (client,from,body,adminId,userSessions) =>{
  switch(body){
    case '1':
    case 'Sim':
        await client.sendText(from,'Que ótimo!')
        await handleGetFirstDate(client, from, userSessions,adminId, null, null);
      break
    case '2':
    case 'Nao':
    case 'Não':
      await client.sendText(from, `Entendi, ${userSessions[adminId][from].userName}! Vou apresentar pra você todos os nossos serviços novamente`)
      delete userSessions[adminId][from]
      await sendInitialMenu(client,from,userSessions,adminId)
      break
    default:
      await client.sendText(from, "Por favor digite uma opção válida.")
      break
  }
}

const isValidDate = (date) => {
  return !isNaN(Date.parse(date));
};

const handleGetFirstDate = async (client, from, userSessions, adminId, shift, date) => {
  console.log("oi",date)
  try {
    let params = new URLSearchParams();

    if (shift) {
      params.append('shift', shift);
    }

    if (isValidDate(date)) {
      params.append('date', date);
    }
    

    const queryString = params.toString();
    let url = '';


    if (userSessions[adminId][from].matchingSection === 'agendar consulta') {
      url = `procedures/nextProfessionalDate/${userSessions[adminId][from].selectedRow.rowId}`;
    } else if (userSessions[adminId][from].matchingSection === 'agendar procedimento') {
      url = `professional/openedHours/${adminId}?procedureId=${userSessions[adminId][from].selectedRow.rowId}`;
    }

    if (queryString) {
      if (url.includes('?')) {
        url += `&${queryString}`;
      } else {
        url += `?${queryString}`;
      }
    }
    
    const nextDate = await api.get(url);
    const today = new Date()
    const todayString = today.toISOString().split('T')[0];
    if (nextDate.data.length > 0) {
      if(date && nextDate.data[0].date != date && todayString !== date){
        await client.sendText(from,`Não temos um horário disponível neste dia, vou procurar uma data mais próxima possível!`)
      }
      userSessions[adminId][from].nextDate = nextDate.data[0];
      await client.sendText(from, `Encontramos um horário mais próximo pra você com o Dr. ${nextDate.data[0].professionalName}! Dia ${convertDateToWrittenFormat(nextDate.data[0].date)} às ${nextDate.data[0].start}`);
      await client.sendText(from, `Podemos agendar?\n\n1️⃣ || Pode sim!\n2️⃣ || Tenho preferência de turno\n3️⃣ || Tenho preferência por dia`);
      userSessions[adminId][from].step = 'awaiting_filtrar_ou_agendar';
    } else {
      await client.sendText(from, "A agenda de horários não está aberta no momento, desculpe o transtorno");
      delete userSessions[adminId][from];
      await sendInitialMenu(client, from, userSessions, adminId);
      return;
    }
  } catch (error) {
    console.error("Erro na requisição:", error);
    if (error.response && error.response.status == 409) {
      await client.sendText(from, "Não temos agenda aberta para este serviço");
      delete userSessions[adminId][from];
      await sendInitialMenu(client, from, userSessions, adminId);
    }
  }
};


const handleConfirmarConsulta = async (client,from, body,adminId, userSessions ) => {
  switch(body){
    case '1':
      await client.sendText(from,'Combinado! Nos vemos amanhã!')
      await api.patch(`/schedules/${userSessions[adminId][from].appointment.id}`, { status:'confirmed'})
      delete userSessions[adminId][from]
      break
    case '2':
      await client.sendText(from,`Você confirma o cancelamento da sua consulta?\n\n1️⃣ || Sim\n2️⃣ || Não`)
      userSessions[adminId][from].step = 'awaiting_cancelar_consulta'
      break
    default:
      await client.sendText(from,"Por favor selecione uma opção válida")
      break
  }
}

const handleCancelarConsulta = async(client,from,body,adminId, userSessions )=>{
  switch(body){
    case '1':
      await api.patch(`/schedules/${userSessions[adminId][from].appointment.id}`, { status:'canceled'})
      await client.sendText(from,'Sua consulta foi cancelada!')
      delete userSessions[adminId][from]
      break
    case'2':
      await client.sendText(from, `Olá, ${userSessions[adminId][from].appointment.patientName}! tudo bem? Nos encontramos de novo.\nTemos sua consulta confirmada para amanhã com o doutor ${userSessions[adminId][from].appointment.professionalName} ${userSessions[adminId][from].appointment.start} ás ${userSessions[adminId][from].appointment.end}! tudo certo?\n\n1️⃣ || Sim\n2️⃣ || Não`);
      userSessions[adminId][from].step = 'awaiting_schedule_confirmation'
      break
    default:
      await client.sendText(from,"Por favor selecione uma opção válida")
      break
  }
}



module.exports={handleCancelarConsulta,handleResponseCotinuarAgendamento, handleGetFirstDate, handleResponseAgendarOuFiltrar, handleAwaitingTurno, handleAwaitingDia, handleAgendar, restart, handleConfirmarConsulta}