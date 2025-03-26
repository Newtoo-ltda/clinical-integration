const { sendInitialMenu } = require("./initialMenu")

const handleAfkResponse = async (client, from, body,adminId, userSessions) => {
  switch(body){
    case '1':
    case '1':
      await sendInitialMenu(client,from,userSessions,adminId)
      break
    case '2':
    case '2':
      await client.sendText(from,'Compartilha com a gente, qual a sua dificuldade?')
      userSessions[adminId][from].step = 'awaiting_afk_response_2'
      break
    case '3':
    case '3':
      await client.sendText(from,'Estamos chamando uma atendente humana para continuar o atendimento!É bem rápido')
      procurarAtendente(client,from,body,adminId,userSessions)
      break
    default:
      await client.sendText(from,"Digite uma opção válida")
      break
  }
}

const awaitingAfkResponse2 = async (client,from,body,adminId,userSessions)=>{
  await client.sendText(from,'Estamos chamando uma atendente humana para continuar o atendimento!É bem rápido')
  procurarAtendente(client,from,body,adminId,userSessions)
}

function procurarAtendente(client,from,body,adminId, userSessions){
  userSessions[adminId][from].step = 'in-attendance'
}
module.exports= {handleAfkResponse, awaitingAfkResponse2}