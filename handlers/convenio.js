const axios = require("axios");
const { handleGetFirstDate } = require("./agendamento");

const api = axios.create({
  baseURL: "https://newtoo.space/"
});

const handleParticularResponse = async (client, from, body,adminId, userSessions) => {
  const {data: procedure} = await api.get(`procedures/${userSessions[adminId][from].selectedRow.rowId}`)
  if(body.listResponse.title == "Nenhum"){
    await client.sendText(from,'Me desculpe, por enquanto só aceitamos esses convênio!')
    await client.sendText(from, `Gostaria de continuar para o agendamento?\n\n1️⃣ || Sim\n2️⃣ || Não`)
    userSessions[adminId][from].step = 'awaiting_continuar_agendamento'
  } else {
    userSessions[adminId][from].selectedConvenio = {id:body.listResponse.singleSelectReply.selectedRowId , title:body.listResponse.title}
    await handleGetFirstDate(client,from,userSessions,adminId,null,null)
  }
}

const handleParticularConvenio = async (client, from, body, adminId,userSessions) => {
switch(body){
  case '1':
  case 'Particular':
    const conveniosParticulares = userSessions[adminId][from].convenios

    const convenioRows = conveniosParticulares.map(convenio => ({
      rowId: convenio.id.toString(),
      title: convenio.name,
      description: '' 
    }));

    convenioRows.push({
      rowId: 'nenhum',
      title: 'Nenhum',
      description: ''
    });

    await client.sendListMessage(from, {
      buttonText: 'Ver convênios',
      description: `Você selecionou a opção Particular. Por favor, selecione um convênio:`,
      sections: [
        {
          title: 'Convênios',
          rows: convenioRows
        }
      ]
    });
    userSessions[adminId][from].step = 'awaiting_particular_select';
    break
  case '2':
  case 'SUS':
    await client.sendText(from,`Obrigado(a), ${userSessions[adminId][from].userName}! Vamos seguir na sua consulta pelo SUS`)
    await handleGetFirstDate(client, from, userSessions,adminId, null, null)
    break
  case '3':
  case 'Nenhum':
      await client.sendText(from,`Obrigado(a), ${userSessions[adminId][from].userName}! Vamos seguir na sua consulta pelo sem convênio`)
      await handleGetFirstDate(client, from, userSessions,adminId , null, null)
    break
  default:
      await client.sendText(from,`Digite uma opção valida`)
    break
}
  

};

const handleConvenio = async (client, from, body, adminId,userSessions) => {
  switch(body){
    case '1':
    case 'SUS':
      await client.sendText(from,`Obrigado(a), ${userSessions[adminId][from].userName}! Vamos seguir na sua consulta pelo SUS`)
      await handleGetFirstDate(client, from, userSessions,adminId, null, null)
      break
    case '2':
    case 'Nenhum':
        await client.sendText(from,`Obrigado(a), ${userSessions[adminId][from].userName}! Vamos seguir na sua consulta sem convênio`)
        await handleGetFirstDate(client, from, userSessions,adminId , null, null)
      break
    default:
        await client.sendText(from,`Digite uma opção valida`)
      break
  }
  };



module.exports = { handleParticularConvenio, handleParticularResponse, handleConvenio };
