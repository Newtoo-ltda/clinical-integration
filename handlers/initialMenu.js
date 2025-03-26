const axios = require("axios");
require('dotenv').config();

const api = axios.create({
  baseURL: "http://newtoo.space/"
});
// const sections = [];
const sections = {};  

const sendInitialMenu = async (client, from, userSessions, adminId) => {
  try {
    sections[adminId] = [];  // Inicializa as seções para o admin específico
    const { data: admin } = await api.get(`/admin/${adminId}`);
    
    if (admin.procedures && admin.procedures.length > 0) {
      const procedureRows = admin.procedures.map(procedure => ({
        rowId: procedure.id.toString(),
        title: `${procedure.name} - R$ ${procedure.value}`,
      }));

      sections[adminId].push({
        title: 'Agendar Procedimento',
        rows: procedureRows
      });
    }

    if (admin.professionals && admin.professionals.length > 0) {
      const professionalsRows = admin.professionals.map(professional => ({
        rowId: professional.id.toString(),
        title: `${professional.name}`,
      }));

      sections[adminId].push({
        title: 'Agendar Consulta',
        rows: professionalsRows
      });
    }

    await client.sendListMessage(from, {
      buttonText: 'Continuar',
      description: `Eu sou a Lua, atendente Virtual da clínica ${admin.name}. É um prazer recebê-lo em nossa clínica.\n` +
        `Como posso ajudar você hoje? Por favor, selecione abaixo:\n`,
      sections: sections[adminId]
    });

    if (!userSessions[adminId]) {
      userSessions[adminId] = {};
    }

    userSessions[adminId][from] = { step: 'await_user_response' };
  } catch (error) {
    console.error('Erro ao obter dados do administrador:', error);
    await client.sendText(from, 'Desculpe, ocorreu um erro ao obter os dados do administrador. Por favor, tente novamente mais tarde.');
  }
};


const handleInitialMenuResponse = async (client, from, body, adminId,userSessions) => {
  const selectedOption = body.toLowerCase();

  let matchingSection;
  let selectedRow;

  sections[adminId].forEach(section => {
    const row = section.rows.find(row => row.title.toLowerCase() === selectedOption);
    if (row) {
      matchingSection = section.title.toLowerCase();
      selectedRow = row;
      userSessions[adminId][from].matchingSection = matchingSection
      userSessions[adminId][from].selectedRow = selectedRow
    }
  });


  switch(matchingSection){
    case 'agendar procedimento':
      if(!userSessions[adminId][from].userName){
        await askName(client, from, userSessions, adminId);
      }
      break
    case 'agendar consulta':
      if(!userSessions[adminId][from].userName){
        await askName(client, from, userSessions, adminId);
      }
      break
    default:
      await client.sendText(from, 'Desculpe, não entendi. Por favor, selecione uma opção válida.');
      break
  }
};

const askName = async (client, from ,userSessions, adminId) => {
  try {
    await client.sendText(from, `Para continuarmos, poderia nos dizer o seu nome completo?`);
    userSessions[adminId][from].step = 'awaiting_name';
  } catch (error) {
    console.error('Erro ao solicitar nome do usuário:', error);
    await client.sendText(from, 'Desculpe, ocorreu um erro ao solicitar seu nome. Por favor, tente novamente mais tarde.');
  }
};

const handleNameResponse = async (client, from, body, userSessions, adminId) => {
  const userName = body;

  if (userName.length > 0) {
    userSessions[adminId][from].userName = userName;

    switch(userSessions[adminId][from].matchingSection){
      case 'agendar procedimento':
        await client.sendText(from, `Vamos la, ${userSessions[adminId][from].userName}!`);
        await client.sendText(from, `Vamos precisar de algumas informações para seguir com o agendamento do seu exame, tudo bem?`);    
        await api.get(`health-insurance/${adminId}`).then(async(response)=> {
          if(response.data.length > 0){
            await client.sendText(from, `Será por algum destes convênios?\n\n1️⃣ ||​ Particular\n2️⃣ || SUS\n3️⃣ || Nenhum\n
              `);
              userSessions[adminId][from].convenios = response.data
              userSessions[adminId][from].step = 'awaiting_convenio_particular'
            } else {
              await client.sendText(from, `Será por algum destes convênios?\n\n1️⃣ || SUS\n2️⃣ || Nenhum\n`);
              userSessions[adminId][from].step = 'awaiting_convenio'
          }
      })
       break
      case 'agendar consulta':
        await client.sendText(from, `Vamos la, ${userSessions[adminId][from].userName}!`);
        await client.sendText(from, `Vamos precisar de algumas informações para seguir com o agendamento da sua consulta, tudo bem?`);
        await api.get(`health-insurance/${adminId}`).then(async(response)=> {
            if(response.data.length > 0){
              await client.sendText(from, `Será por algum destes convênios?\n\n1️⃣ || Particular\n2️⃣ || SUS\n3️⃣ || Nenhum\n
                `);
                userSessions[adminId][from].convenios = response.data
                userSessions[adminId][from].step = 'awaiting_convenio_particular'
              } else {
                await client.sendText(from, `Será por algum destes convênios?\n\n1️⃣ || SUS\n2️⃣ || Nenhum\n`);
                userSessions[adminId][from].step = 'awaiting_convenio'
            }
        })
        break
      default:
        await client.sendText(from, `Opção inválida`);
        break
    }

  } else {
    await client.sendText(from, 'Por favor, insira um nome válido.');
    await askName(client, from, userSessions, adminId );
    return; 
  }

};
module.exports = {sendInitialMenu, handleInitialMenuResponse, askName, handleNameResponse}