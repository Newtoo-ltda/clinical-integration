require('dotenv').config();
const { default: axios } = require("axios");

const handleFeedbackRequest = async (client, from,adminId, userSessions) => {
  await client.sendText(from, 'Você gostaria de fornecer feedback sobre a consulta? Responda com:\n\n1️⃣ || Sim\n2️⃣ || Não');
  userSessions[adminId][from].step = 'awaiting_yes_no_feedback';
};

const handleYesNoFeedback = async (client,from,body, adminId, userSessions)=>{
  switch(body){
    case '1':
    case 'Sim':
      await client.sendText(from, `Como foi o processo de atendimento de nossa clinica.\n\n1️⃣ || Muito ruim\n2️⃣ || Ruim\n3️⃣ || Bom\n4️⃣ || Muito bom\n5️⃣ || Excelente`
      )
      userSessions[adminId][from].step = 'awaiting_rate_feedback'
      break
    case '2':
    case 'Não':
    case 'Nao':
      await client.sendText(from, 'Perfeito, obrigado pela confiança.')
      delete userSessions[adminId][from]
      break
    default:
      await client.sendText(from,'Selecione uma opção válida.')
      break
  }
}

const handleAwaitingRate = async (client, from, body, adminId,userSessions) => {
  if (!userSessions[adminId][from]) {
    userSessions[adminId][from] = {};
  }


  switch (body) {
    case '1':
    case 'Muito ruim':
      userSessions[adminId][from].feedback.rate = '1';
      await client.sendText(from, "Deixe um comentário sobre o que achou do seu processo com a nossa clinica.");
      userSessions[adminId][from].step = 'awaiting_feedback';
      break;
    case '2':
    case 'Ruim':
      userSessions[adminId][from].feedback.rate = '2';
      await client.sendText(from, "Deixe um comentário sobre o que achou do seu processo com a nossa clinica.");
      userSessions[adminId][from].step = 'awaiting_feedback';
      break;
    case '3':
    case 'Bom':
      userSessions[adminId][from].feedback.rate = '3';
      await client.sendText(from, "Deixe um comentário sobre o que achou do seu processo com a nossa clinica.");
      userSessions[adminId][from].step = 'awaiting_feedback';
      break;
    case '4':
    case 'Muito bom':
      userSessions[adminId][from].feedback.rate = '4';
      await client.sendText(from, "Deixe um comentário sobre o que achou do seu processo com a nossa clinica.");
      userSessions[adminId][from].step = 'awaiting_feedback';
      break;
    case '5':
    case 'Excelente':
      userSessions[adminId][from].feedback.rate = '5';
      await client.sendText(from, "Deixe um comentário sobre o que achou do seu processo com a nossa clinica.");
      userSessions[adminId][from].step = 'awaiting_feedback';
      break;
    default:
      await client.sendText(from, 'Por favor digite uma opção válida de 1 à 5.');
  }
};


const handleAwaitingFeedback = async (client, from, body, adminId,userSessions) => {
  if(body.length>0){
    userSessions[adminId][from].feedback.feedback = body
    const feedbackData = {
        professionalId:userSessions[adminId][from].feedback.professionalId,
        patientId:userSessions[adminId][from].feedback.patientId,
        adminId:+adminId,
        rate:+userSessions[adminId][from].feedback.rate,
        content:body
    }
    await axios.post('https://newtoo.space/feedback',feedbackData).catch(error=>console.log(error))
    await client.sendText(from, "Obrigado pelo seu feedback!")
    delete userSessions[adminId][from]
  }else{
    await client.sendText(from, 'Por favor digite seu feedback.')
  }
}


module.exports = {
  handleAwaitingFeedback,
  handleFeedbackRequest,
  handleYesNoFeedback,
  handleAwaitingRate
};
