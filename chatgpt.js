const OpenAI = require('openai');
const axios = require("axios");
const api = require('./Service/api');

const openai = new OpenAI({
  apiKey: "SUA-CHAVE-API-AQUI"
});

const cancelAppointment = async (appointmentId, client, from) => {
  try {
    await api.patch(`/schedules/${appointmentId}`, { status: 'canceled' });
    await client.sendText(from, 'Your appointment has been successfully canceled.');
  } catch (error) {
    console.error('Error canceling appointment:', error);
    await client.sendText(from, 'There was an error canceling your appointment. Please try again later.');
  }
};
const confirmAppointment = async (appointmentId, client, from) => {
  try {
    await api.patch(`/schedules/${appointmentId}`, { status: 'confirmed' });
    await client.sendText(from, 'Your appointment has been successfully canceled.');
  } catch (error) {
    console.error('Error canceling appointment:', error);
    await client.sendText(from, 'There was an error canceling your appointment. Please try again later.');
  }
};

const contarTokens = (data) => {
  const stringData = JSON.stringify(data);
  return stringData.length; 
};

const agent = new (require("https").Agent)({ keepAlive: true });


const procedimentos = async () => {
  try {
    const response = await axios.get(
        "https://cpp.focuscw.com.br/datasnap/rest/TEntityController/valorprocedimentos", 
        { timeout: 120000, httpsAgent: agent }
    );
    
    // Verificar se os dados foram recebidos corretamente
    if (!response.data || !Array.isArray(response.data)) {
      console.error("Dados de procedimentos inválidos ou ausentes", response.data);
      return []; // Retorna um array vazio em caso de erro
    }

    // Filtra os dados para conter apenas os procedimentos que possuem o campo 'convenios'
    const filteredData = response.data
        .filter(procedimento => 
            procedimento.grupoProcedimento !== "SEM GRUPO" && 
            !/^[zZ]/.test(procedimento.nomeProcedimento) &&
            procedimento.convenios && procedimento.convenios.length > 0 // Garante que 'convenios' existe e não está vazio
        )
        .map(({ idProcedimento, nomeProcedimento, convenios }) => {
            const nomeSplit = nomeProcedimento.split(' ').slice(0, 4).join(' ');
            //console.log("Nome do procedimento:", nomeSplit);
            const conveniosData = convenios.map(({ idConvenio,nomeConvenio, valor }) => ({
                idConvenio,
                nomeConvenio,
                valor
            }));
            //console.log("Convênios do procedimento:", conveniosData);
            return {
                idProcedimento,
                nomeProcedimento: nomeSplit,
                convenios: conveniosData
            };
        });

    //console.log("Procedimentos filtrados:", filteredData);
    return filteredData;
  } catch (error) {
      console.error("Error fetching procedimentos:", error);
  }
};


const especialidades = async () => {
  try {
      const response = await axios.get(
          "https://cpp.focuscw.com.br/datasnap/rest/TEntityController/especialidades", 
          { timeout: 120000, httpsAgent: agent }
      );

      const filteredData = response.data.filter(especialidade => especialidade.abreAgenda === "true")
        .map(({ idEspecialidade, nomeEspecialidade }) => ({
          idEspecialidade,
          nomeEspecialidade
        }));
      
      return filteredData;
  } catch (error) {
      console.error("Error fetching especialidades:", error);
      throw error;
  }
};


const convenios = async () => {
    try {
        const response = await axios.get("https://cpp.focuscw.com.br/datasnap/rest/TEntityController/convenios", { timeout: 120000, httpsAgent: agent });
        const filteredData = response.data.map(convenio => ({
            idConvenio: convenio.idConvenio,
            nomeConvenio: convenio.nomeConvenio
        }));
        //console.log(filteredData);
        const tokenCount = contarTokens(filteredData);
        //console.log("Procedimentos token count:", tokenCount);
        return filteredData
    } catch (error) {
        console.error("Error fetching convenios:", error);
    }
};

const profissionais = async () => {
    try {
        const response = await axios.get("https://cpp.focuscw.com.br/datasnap/rest/TEntityController/profissionais", { timeout: 120000, httpsAgent: agent });

        // Filtra apenas os profissionais com situacaoProfissional === 'Ativo'
        const activeProfessionals = response.data.filter(profissional => profissional.situacaoProfissional === "Ativo");

        // Remove profissionais cujo nome começa com "z" ou "Z"
        const filteredProfessionals = activeProfessionals.filter(profissional => !/^[zZ]/.test(profissional.nomeProfissional));

        const filteredData = filteredProfessionals.map(profissional => ({
          idProfissional: profissional.idProfissional,
          nomeProfissional: profissional.nomeProfissional,
          especialidades: profissional.especialidades?.map(e => ({
              idEspecialidade: e.idEspecialidade,
              nomeEspecialidade: e.nomeEspecialidade
          })) || [],
          horarios: profissional.horarios?.map(h => ({
              idUnidade: h.idUnidade,
              diaSemana: h.diaSemana, // Renomeando dia para diaSemana
              inicioHorario: h.inicioHorario, // Renomeando horaInicio
              finalHorario: h.finalHorario // Renomeando horaFim
          })) || []
      }));

        const tokenCount = contarTokens(filteredData);
        //console.log("Profissionais token count:", tokenCount);
       // console.log(JSON.stringify(filteredData, null, 2));
       return filteredData
    } catch (error) {
        console.error("Error fetching profissionais:", error);
    }
};

//Está me retornando corretamente os profissionais e suas respectivas especialidades. O problema é que as especialidades não estão ligadas aos procedimentos. Como resolver isso ?


const clinicInfo = {
  "clinic": {
    "name": "CPP",
    "units": [
      { "id": 1, "name": "Unidade 1 - Joaquim Nabuco", "address": "Rua Joaquim Nabuco, 584, Centro" },
      { "id": 2, "name": "Unidade 2 - Areia Branca", "address": "Rua do Juazeiro, 6" },
      { "id": 3, "name": "Unidade 3 - Tobias Barreto", "address": "Rua Tobias Barreto, 102, Centro" }
    ]
  }
};
function getDayOfWeek(date) {
  const dias = [ 
      "SEGUNDA FEIRA", 
      "TERÇA FEIRA", 
      "QUARTA FEIRA", 
      "QUINTA FEIRA", 
      "SEXTA FEIRA", 
      "SÁBADO",
      "DOMINGO"
  ];
  // Verifica se a data é uma instância válida de Date
  if (!(date instanceof Date)) {
      date = new Date(date); // Tenta converter
  }
  // Verifica se a conversão foi bem-sucedida
  if (isNaN(date)) {
      throw new Error("Data inválida fornecida para getDayOfWeek.");
  }
  return dias[date.getDay()];
}

const detectIntent = async (body, adminId, userSession, client, from) => {

  function ativarAtendimentoHumano(adminId, from) {
    if (!userSession) return;
  
    userSession.atendenteHumano = true;
    console.log(`🤖 Atendimento humano ativado para ${from}. Chatbot pausado por 30 minutos.`);
  
    setTimeout(() => {
        userSession.atendenteHumano = false;
        console.log(`✅ Chatbot reativado para ${from}.`);
    }, 30 * 60 * 1000); // 30 minutos
  }

  try {
   
    console.log("userSession", userSession)
   
        const procedimentosData = await procedimentos();
        const especialidadesData = await especialidades();
        const conveniosData = await convenios();
        const profissionaisData = await profissionais();
        const formattedUnidades = clinicInfo.clinic.units.map(u => `id ${u.id} ${u.name}`).join('; ');
        const formattedProcedures = procedimentosData.map(p => {
    const conveniosInfo = p.convenios.map(c => `Convênio ${c.idConvenio} ${c.nomeConvenio}: R$${c.valor}`).join(', ');
    return `Id do procedimento: ${p.idProcedimento} - Nome: ${p.nomeProcedimento} Convenios e valores:(${conveniosInfo})`; // Incluindo o idProcedimento
}).join('; ');
const format1Procedures = procedimentosData.map(p => 
  `${p.idProcedimento} - ${p.nomeProcedimento}`
).join("; ");
//console.log("Procedimentos formatados:", formattedProcedures)
        const formattedProfessionals = profissionaisData.map(pro =>
          `id ${pro.idProfissional} ${pro.nomeProfissional} 
          (${pro.especialidades.map(e => e.nomeEspecialidade).join(', ')})
          Unidades: ${pro.horarios.map(h => `${h.idUnidade} (${h.diaSemana} das ${h.inicioHorario} às ${h.finalHorario})`).join('; ')}`  
        ).join('; ');
        const format1Professionals = profissionaisData.map(pro => `id ${pro.idProfissional} ${pro.nomeProfissional}`).join('; ');
        const formattedConvenios = conveniosData.map(pro => `id ${pro.idConvenio} ${pro.nomeConvenio}`).join('; ');
        const formattedEspecialidades = especialidadesData.map(pro => `id ${pro.idEspecialidade} ${pro.nomeEspecialidade}`).join('; ');

        async function retornaHorario() {
          try {
              let completionHorarios = [];
              let unidadesSelecionadas = new Set(); // Garante que só temos 3 unidades diferentes
              const unidades = [1, 2, 3]; // IDs das unidades disponíveis
              const agora = new Date();
              const horaBrasilia = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000);
              const dataAtual = horaBrasilia.toISOString().split("T")[0]; // formato YYYY-MM-DD
              const horaAtual = horaBrasilia.toTimeString().split(" ")[0]; // formato HH:MM:SS
      
              console.log("Agora:", agora);
              console.log("A data atual é", dataAtual, "e a hora atual é", horaAtual);
      
              // Define se a busca será filtrada por uma data específica ou não
              const dataBusca = userSession.date || null;
              console.log(`📅 Buscando horários para a data: ${dataBusca ? dataBusca : "data mais próxima disponível"}`);
      
              for (const unidade of unidades) {
                  if (unidadesSelecionadas.size >= 3) break; // Garante que teremos no máximo 3 unidades diferentes
      
                  let response = await axios.get(
                      `https://cpp.focuscw.com.br/datasnap/rest/TCalendarController/consultaAgendamentoUnidadeEspecialidade/${unidade}/${userSession.procedureId}?s=true`, { timeout: 120000, httpsAgent: agent }
                      );
                  console.log(`📡 Buscando horários para especialidade ${userSession.procedureId} na unidade ${unidade}`);
                  
                  if (response.data.length > 0) {
                      // Ordena os horários por data
                      let horariosDisponiveis = response.data.sort((a, b) => new Date(a.dataAgenda) - new Date(b.dataAgenda));
      
                      // 🔹 Se userSession.date estiver definido, filtra apenas os horários dessa data
                      if (dataBusca) {
                          horariosDisponiveis = horariosDisponiveis.filter(horario => horario.dataAgenda === dataBusca);
                      } else {
                          // 🔹 Se userSession.date NÃO estiver definido, busca a data mais próxima COM HORÁRIOS VÁLIDOS
                          horariosDisponiveis = horariosDisponiveis.filter(horario =>
                              new Date(horario.dataAgenda) >= new Date(dataAtual)
                          );
                      }
      
                      // Se ainda não há horários disponíveis, pula para a próxima unidade
                      if (horariosDisponiveis.length === 0) continue;
      
                      for (const horario of horariosDisponiveis) {
                          for (const slot of horario.horarios) {
                              const diaSemanaPaciente = getDayOfWeek(horario.dataAgenda);
                            //  console.log("O dia da semana escolhido pelo paciente foi", diaSemanaPaciente)
                              // 🔹 Remover horários que já passaram no mesmo dia
                              const horarioAgenda = new Date(horario.dataAgenda + 'T' + slot.horaAgenda); // Cria o objeto Date completo
      
                              if (horarioAgenda <= new Date()) {
                                  console.log(`⏳ Removendo horário passado: ${slot.horaAgenda} do dia ${dataAtual}`);
                                  continue; // Pula para o próximo horário
                              }
      
                              // Busca os profissionais compatíveis para este horário e unidade
                              const profissionaisCompatíveis = profissionaisData.filter(prof =>
                                  prof.especialidades.some(esp => esp.idEspecialidade === userSession.procedureId) &&
                                  prof.horarios.some(horarioProf =>
                                      horarioProf.idUnidade === unidade &&
                                      horarioProf.diaSemana === diaSemanaPaciente &&
                                      slot.horaAgenda >= horarioProf.inicioHorario &&
                                      slot.horaAgenda <= horarioProf.finalHorario
                                  )
                              );
      
                              // 🔹 Verificar se o profissional realmente atende nesse horário específico
                              const profissionalValido = profissionaisCompatíveis.find(prof =>
                                  prof.horarios.some(horarioProf =>
                                      horarioProf.idUnidade === unidade &&
                                      horarioProf.diaSemana === diaSemanaPaciente &&
                                      slot.horaAgenda >= horarioProf.inicioHorario &&
                                      slot.horaAgenda <= horarioProf.finalHorario
                                  )
                              );
      
                              if (profissionalValido && !unidadesSelecionadas.has(unidade)) {
                                  completionHorarios.push({
                                      unidade: horario.nomeUnidade,
                                      idUnidade: horario.idUnidade,
                                      dataAgenda: horario.dataAgenda,
                                      idAgenda: slot.idAgenda,
                                      horaAgenda: slot.horaAgenda,
                                      idProfissional: profissionalValido.idProfissional,
                                      nomeProfissional: profissionalValido.nomeProfissional
                                  });
      
                                  unidadesSelecionadas.add(unidade); // Adiciona a unidade à lista de selecionadas
      
                                  console.log(
                                      `📌 Unidade: ${horario.nomeUnidade} - Horário disponível: ${slot.horaAgenda} - Profissional: ${profissionalValido.nomeProfissional}`
                                  );
      
                                  break; // Garante que pegamos apenas 1 horário por unidade
                              }
                          }
                      }
                  }
              }
      
              console.log("✅ Horários finalizados:", completionHorarios);
              return completionHorarios;
          } catch (error) {
              console.error("❌ Erro ao buscar horários:", error);
              return [];
          }
      }
      
      
      
      async function buscarHorariosProfissional(professionalId, procedureId) {
        try {
            console.log(`🔍 Buscando horários para Profissional: ${professionalId}, Especialidade: ${procedureId}`);
    
            const unidades = [1, 2, 3]; // IDs das unidades disponíveis
            let horariosDisponiveis = [];
            const agora = new Date();
            const horaBrasilia = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000);
            console.log("O horário de Brasilia é:", horaBrasilia)
            const dataAtual = horaBrasilia.toISOString().split("T")[0]; // formato YYYY-MM-DD
            const horaAtual = horaBrasilia.toTimeString().split(" ")[0]; // formato HH:MM:SS
    
            const dataFiltro = userSession && userSession.date ? userSession.date : null;
    
            for (const unidade of unidades) {
                const response = await axios.get(`https://cpp.focuscw.com.br/datasnap/rest/TCalendarController/consultaAgendamentoUnidadeEspecialidadeProfissional/${unidade}/${procedureId}/${professionalId}?s=true`, { timeout: 120000, httpsAgent: agent });
    
                console.log(`✅ Buscando horários na unidade ${unidade}...`);
    
                response.data.forEach(horario => {
                    if (dataFiltro && horario.dataAgenda !== dataFiltro) {
                        return;
                    }
    
                    horario.horarios.forEach(slot => {
                      const dataHoraSlot = new Date(`${horario.dataAgenda}T${slot.horaAgenda}`);

                      if (dataHoraSlot.getTime() <= agora.getTime()) {
                        console.log(`⏳ Ignorando horário passado: ${slot.horaAgenda} do dia ${horario.dataAgenda}`);
                        return;
                    }
    
                        horariosDisponiveis.push({
                            unidade: horario.nomeUnidade,
                            idUnidade: horario.idUnidade,
                            dataAgenda: horario.dataAgenda,
                            horaAgenda: slot.horaAgenda,
                            idAgenda: slot.idAgenda
                        });
                    });
                });
            }
    
            // Ordenar por data e hora
            horariosDisponiveis.sort((a, b) => new Date(a.dataAgenda + " " + a.horaAgenda) - new Date(b.dataAgenda + " " + b.horaAgenda));
    
            // Garantir que sempre retorne 3 opções
            return horariosDisponiveis.slice(0, 3);
        } catch (error) {
            console.error("❌ Erro ao buscar horários do profissional:", error);
            return [];
        }
    }

        async function processaEscolhaHorario(horaUsuario) {
          try {
              console.log(`🔍 Buscando horário correspondente para: ${horaUsuario}`);
      
              let horariosDisponiveis = [];
      
              // 🔹 Verifica se um profissional específico foi escolhido
              if (userSession.professionalId) {
                  horariosDisponiveis = await buscarHorariosProfissional(userSession.professionalId, userSession.procedureId);
              } else {
                  horariosDisponiveis = await retornaHorario();
              }
      
              console.log("📅 Horários disponíveis:", horariosDisponiveis);
      
              // 🔹 Se não há horários disponíveis, retorna valores nulos
              if (!horariosDisponiveis || horariosDisponiveis.length === 0) {
                  console.log("❌ Nenhum horário disponível encontrado.");
                  return { idAgenda: null, horaAgenda: null, idUnidade: null, professionalId: null, date: null };
              }
      
              // 🔹 Procura um horário correspondente
              const horarioEscolhido = horariosDisponiveis.find(h => h.horaAgenda === horaUsuario);
      
              if (horarioEscolhido) {
                  console.log(`✅ Horário encontrado! ID: ${horarioEscolhido.idAgenda}, Hora: ${horarioEscolhido.horaAgenda}, Unidade: ${horarioEscolhido.idUnidade}`);
      
                  // 🔹 Atualiza a sessão do usuário
                  userSession.idAgenda = horarioEscolhido.idAgenda;
                  userSession.horaAgenda = horarioEscolhido.horaAgenda;
                  userSession.idUnidade = horarioEscolhido.idUnidade;
                  userSession.date = horarioEscolhido.dataAgenda;
      
                  // 🔹 Se o horário foi buscado por um profissional, mantemos esse ID
                  if (userSession.professionalId) {
                      return {
                          idAgenda: horarioEscolhido.idAgenda,
                          horaAgenda: horarioEscolhido.horaAgenda,
                          idUnidade: horarioEscolhido.idUnidade,
                          professionalId: userSession.professionalId,
                          date: horarioEscolhido.dataAgenda
                      };
                  }
      
                  // 🔹 Caso contrário, verifica se `horarioEscolhido` tem `idProfissional`
                  if (horarioEscolhido.idProfissional) {
                      userSession.professionalId = horarioEscolhido.idProfissional;
                  }
      
                  return {
                      idAgenda: horarioEscolhido.idAgenda,
                      horaAgenda: horarioEscolhido.horaAgenda,
                      idUnidade: horarioEscolhido.idUnidade,
                      professionalId: userSession.professionalId || null,
                      date: horarioEscolhido.dataAgenda
                  };
              }
      
              console.log("❌ Nenhum horário correspondente foi encontrado.");
              return { idAgenda: null, horaAgenda: null, idUnidade: null, professionalId: null, date: null };
      
          } catch (error) {
              console.error("🚨 Erro em processaEscolhaHorario:", error);
              return { idAgenda: null, horaAgenda: null, idUnidade: null, professionalId: null, date: null };
          }
      }
      
      function formatarData(data, formato = "padrao") {
        if (!data) return null;
    
        const meses = [
            "janeiro", "fevereiro", "março", "abril", "maio", "junho",
            "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
        ];
    
        const [ano, mes, dia] = data.split("-");
    
        if (formato === "extenso") {
            return `${parseInt(dia)} de ${meses[parseInt(mes) - 1]} de ${ano}`;
        } else {
            return `${dia}/${mes}/${ano}`;
        }
    }

      async function processaEscolhaUnidade(unidadeUsuario) {
        try {
          console.log(`🔍 Buscando unidade correspondente para: ${unidadeUsuario}`);
          const unidadesDisponiveis = await retornaHorario();
          console.log("📅 Horários disponíveis:", unidadesDisponiveis);

          if (!unidadesDisponiveis || unidadesDisponiveis.length === 0){
              console.log("❌ Nenhum horário disponível encontrado.");
              return { idAgenda: null, horaAgenda: null, idUnidade: null, professionalId: null };
                }

                const UnidadeEscolhida = unidadesDisponiveis.find(h => h.idUnidade === unidadeUsuario);
                if (UnidadeEscolhida) {
                  console.log(`✅ Unidade encontrada! ID: ${UnidadeEscolhida.idUnidade}, Hora: ${UnidadeEscolhida.horaAgenda}, Id Horário: ${UnidadeEscolhida.idAgenda} com Profissional ${UnidadeEscolhida.idProfissional}`);
                  userSession.idUnidade = UnidadeEscolhida.idUnidade;
                  userSession.horaAgenda = UnidadeEscolhida.horaAgenda;
                  userSession.idAgenda = UnidadeEscolhida.idAgenda;
                  userSession.professionalId = UnidadeEscolhida.idProfissional;
                  console.log("📝 Atualizando userSession com unidade escolhida:", userSession);

                  return {
                    idAgenda: UnidadeEscolhida.idAgenda,
                    horaAgenda: UnidadeEscolhida.horaAgenda,
                    idUnidade: UnidadeEscolhida.idUnidade,
                    professionalId: UnidadeEscolhida.idProfissional
                    };
                    }
                    console.log("❌ Nenhuma unidade correspondente foi encontrada.");
                    return { idAgenda: null, horaAgenda: null, idUnidade: null, professionalId: null };
        } catch (error) {
          console.error("🚨 Erro em processaEscolhaUnidade:", error);
          return { idAgenda: null, horaAgenda: null, idUnidade: null, professionalId: null }
      }}

      function formatarTelefone(telefone) {
        // Remove a parte do telefone após o '@'
        let telefoneFormatado = telefone.split('@')[0];
      
        // Remove qualquer caractere não numérico (caso haja)
        telefoneFormatado = telefoneFormatado.replace(/\D/g, '');
      
        // Formata para o formato desejado (se necessário)
        if (telefoneFormatado.length === 13 && telefoneFormatado.startsWith('55')) {
          telefoneFormatado = telefoneFormatado.slice(2); // Remove o código do país (55)
        }
      
        return telefoneFormatado;
      }
      //const agendaData = await retornaHorario()
      

    let context = `
    Informações da Clínica: ${clinicInfo}
    Unidades: ${formattedUnidades}
    Especialidades Disponíveis: ${formattedEspecialidades}
    Profissionais Disponíveis: ${formattedProfessionals}
    Convenios disponiveis: ${formattedConvenios}
    ${userSession.context}
    `;

    // O context está ficando muito grande. Precisamos encontrar uma forma de fragmentar isso.

    const today = new Date()
    function getFormattedDate() {
    
      // Extrai o ano, o mês e o dia
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0'); // Adiciona zero à esquerda
      const day = String(today.getDate()).padStart(2, '0'); // Adiciona zero à esquerda
    
      // Retorna no formato "aaaa-mm-dd"
      console.log(day)
      return `${day}/${month}/${year}`;
    }
    const dateOnly = getFormattedDate();
    const paramsData = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Voce é responsavel por extrair o parametro data de um fluxo de conversa entre uma pessoa um uma ia, onde esta pessoa esta tentando marcar uma consulta para certa data, se voce identificar essa data SEMPRE retorne ela no formato aaaa-mm-dd, vamos supor que o usuario EXPLICITAMENTE queira para o dia mais proximo possivel, RETORNE OBRIGATORIAMENTE a data de hoje. se nao identificar nada retorne "null". LEMBRE SEMPRE que agora é ${today} e FIQUE EM MENTE QUE hoje é ${dateOnly}.
          Entrada:
          "Quero marcar para amanha"
          Saída: 2024-07-10 ( caso hoje seja dia 2024-07-09 )
          Entrada 2:
          "Quero marcar para hoje"
          Saída: 2024-07-09 ( caso hoje seja dia 2024-07-09 )
          Entrada 3: 
          "Quero marcar para o dia 19"
          Saída: 2024-07-19 ( caso hoje seja dia 2024-07-09 )
          Entrada 4: 
          "Quero marcar para próxima quinta"
          Saída: 2024-07-11 ( caso hoje seja dia 2024-07-09, uma terça-feira )
          Entrada 5: 
          "Quero para quinta"
          Saída: 2024-07-11 ( caso hoje seja dia 2024-07-09, uma terça-feira )
          Entrada 6:
          "Quero marcar um ginecologista"
          Saída: null
          Entrada 7:
          "Particular"
          Saída: null
          Fique atento ao fluxo de conversa para não trocar a data o tempo todo. Apenas atualize a data novamente se corroborar com essas premissas:
          1. userSession.date vazio em ${userSession.date}
          2. usuário pediu explicitamente por outra data. Exemplo: "Veja se consegue para quarta então"
          
          Observação: se atente ao contexto para caso o usuário ou a atendente tenha informado a data anteriormente ou de outra forma: ${userSession.context}
        `
        },
        {
          role: "user",
          content: body,
        },
      ],
    });
    
    let data = paramsData.choices[0].message.content;
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (data !== "null" && datePattern.test(data)) {
      console.log('Data extraída:', data); // Verifique se a data foi extraída corretamente.
      userSession.date = data;
    } else {
      console.warn("Data inválida recebida:", data);
    }

    const paramsProcediment = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Voce é responsavel por extrair o parametro id de um fluxo de conversa entre uma pessoa e uma ia, de uma especialidade que o usuario escolher, lembrando este é um fluxo de conversa para agendamento de consultas, exames ou procedimentos, se por acaso detectar um procedimento que o usuario quer fazer, associe com sua respectiva especialidade e retorne UNICAMENTE o id, se nao identificar nada que seja equivalente aos disponiveis abaixo retorne somente a palavra "null". Ex.: Se na conversa o usuário quiser marcar uma consulta de fisioterapia e a Fisioterapia estiver disponivel na lista de especialidades, e o id da fisioterapia for 1. VOCE VAI RETORNAR UNICAMENTE O 1, sem as aspas
        Lembre que para qualquer tipo de exame laboratorial como exame de sangue (hemograma completo, acido folico, creatinina, etc), retorne o id da especialidade de exames laboratoriais que é 79
        Exemplo 2:
        Quero marcar uma endoscopia -> 23
        Exemplo 3: "Queria marcar um preventivo" -> 45
        Exemplo 4: "Quero marcar uma consulta com o gastroenterologista" -> 67
        Exemplo 5: "Quero marcar um ultrassom" -> 33
        Exemplo 6: "Quero saber sobre o neuro"-> 69
        Exemplo 7: "Quero marcar um pediatra para meu filho" -> 1
        Exemplo 8: "Quero fazer uma biópsia" -> 79
        Exemplo 9: "Voces tem otorrino ?" -> 51
        aqui estão os procedimentos disponiveis:
        ${formattedProcedures}
        e aqui está a lista de especialidades onde voce vai associar e tirar o id:
        ${formattedEspecialidades}
        `
        },
        {
          role: "user",
          content: body,
        },
      ],
    });

    let procedureId = paramsProcediment.choices[0].message.content.trim();
    procedureId = procedureId !== "null" ? Number(procedureId) : null;

    if (procedureId !== null && !isNaN(procedureId)) {
      userSession.procedureId = procedureId;
      console.log('Procedure ID:', procedureId); // Verifique se o ID do procedimento foi extraído corretamente.
    } else {
      console.log('No valid procedure ID found.');
    }


  // Função para extrair o ID do procedimento
      const paramsConsulta = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
                role: "system",
                content: `Você deve extrair o ID da consulta/exame a partir do fluxo de conversa entre o usuário e uma IA. 
                Se detectar um procedimento, retorne somente o ID correspondente, sem aspas.
                Exemplo: "Quero marcar uma consulta com ortopedista" → 15980 (assumindo que o ID do serviço Consulta com ortopedista seja 15980).
                Exemplo 2: "Quero marcar uma endoscopia" -> 6460
                Exemplo 3: "Quero marcar um ginecologista" -> 16381
                Exemplo 4: "Quero marcar um cardiologista" -> 15975
                Exemplo 5: "Queria uma consulta com endócrino" -> 15978
                Exemplo 5: "Quero uma consulta com o gastroenterologista" -> 15979
                Exemplo 6: "Queria marcar um preventivo" -> 15970
                Exemplo 7: "Quero marcar um ultrassom" -> 162
                Exemplo 8: "Consulta com neuro" -> 16382
                Exemplo 9: "Quero marcar um pediatra para meu filho" -> 16383
                Exemplo 10: "Quero fazer uma biópsia" -> 2167
                Exemplo 11: "Voces tem otorrino?" -> 16366
                Preste atenção ao contexto para não ficar atualizando o tempo todo. Só passe o procedimetno que o paciente EXPLICITAMENTE solicitou. Não atualize o ID se o atual (${userSession.idConsulta}) ainda for válido.
                Se não identificar nenhum procedimento, retorne "null".
                Procedimentos disponíveis: ${format1Procedures}
               Contexto: ${userSession.context}`,
            },
            { role: "user", content: body }
        ]
      });
  
      let consulta = paramsConsulta.choices[0].message.content.trim();
      console.log("Aqui a consulta é", consulta)
      consulta = consulta !== "null" ? Number(consulta) : null;
      if (consulta !== null && !isNaN(consulta)) {
        userSession.idConsulta = consulta;
        if ([7027, 803, 16805, 16806, 16902, 16808, 161, 15553, 16688, 1350, 8096, 7621, 7622, 7623, 16365, 16364, 16804, 16803, 15634].includes(userSession.idConsulta)) {
          console.log("Transferindo para atendente humano...");
          await client.addOrRemoveLabels(from, [{labelId: '7' , type:'add'}]);
          await client.sendText(from, "✅ Estamos te transferindo para uma atendente humana para finalizar o agendamento para o procedimento escolhido. Por favor, aguarde um momento.");
          ativarAtendimentoHumano(adminId, from)
      
          return; 
        }
      } else {
        console.log('No valid consulta ID found.');
      }

      function getValorByConvenio() {
        console.log("🛠 Debug - Entrando na função getValorByConvenio()");
        console.log("🔍 Procedimento atual:", userSession.idConsulta);
        console.log("🔍 Convênio atual:", userSession.convenioId);
      
        if (!userSession.idConsulta || !userSession.convenioId) {
          console.warn("⚠️ userSession.idConsulta ou userSession.convenioId não definidos.");
          return;
        }
      
        const procedure = procedimentosData?.find(p => p.idProcedimento === userSession.idConsulta);
        if (!procedure) {
          console.warn("⚠️ Nenhum procedimento encontrado para idConsulta:", userSession.idConsulta);
          return;
        }
      
        const convenio = procedure?.convenios?.find(c => c.idConvenio === userSession.convenioId);
        if (!convenio) {
          console.warn("⚠️ Nenhum convênio encontrado para convenioId:", userSession.convenioId);
          return;
        }
      
        userSession.valor = convenio.valor;
        console.log(`✅ Valor atualizado: R$${userSession.valor}`);
      }

    const paramsConvenio = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Você é responsável por extrair o parâmetro id de um fluxo de conversa entre uma pessoa e uma IA, referente ao convênio médico que o usuário informar. Este é um fluxo de conversa para agendamento de consultas, exames ou procedimentos.  
          
          Se detectar um convênio mencionado pelo usuário e ele estiver disponível na lista abaixo, retorne UNICAMENTE o id correspondente.  
          
          Se não identificar nenhum convênio equivalente aos disponíveis abaixo, retorne somente a palavra "null".  

          Se o usuário disser que quer fazer pelo particular, retorne somente **0** ( sem aspas )
          
          Exemplo: Se o usuário disser que tem convênio UNIMED e o id da UNIMED for 2, você deve retornar **2** (sem aspas).
          Exemplo 2:
          Entrada: "Quero fazer pelo particular" 
          Saída: "0"
          Entrada 3: "Quero marcar um ortopedista"
          Saída 3: "null"
          
          Aqui está a lista de convênios disponíveis:
          ${formattedConvenios}
          `
        },
        {
          role: "user",
          content: body,
        },
      ],
    });
    
    let convenioId = paramsConvenio.choices[0].message.content.trim();
    convenioId = convenioId !== "null" ? Number(convenioId) : null;
    
    if (convenioId !== null && !isNaN(convenioId)) {
      userSession.convenioId = convenioId;
      console.log('Convênio ID:', convenioId); // Verifique se o ID do convênio foi extraído corretamente.
      if (convenioId !== 0 ){
        await client.addOrRemoveLabels(from, [{labelId: '7' , type:'add'}]);
        await client.sendText(from, "✅ Estamos te transferindo para uma atendente humana para finalizar o agendamento pelo plano de saúde. Aguarde um momento. ")
        ativarAtendimentoHumano(adminId, from)
        return; 
      }
    } else {
      console.log('Nenhum convênio válido encontrado.');
    }

    const paramsUnidade = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
          {
              role: "system",
              content: `
  Você é responsável por extrair o id da unidade escolhida pelo usuário para o agendamento. 
  Se identificar a unidade, retorne UNICAMENTE o id dela. Caso contrário, retorne "null". 
  Só retorne a unidade se ela for explicitamente declarada pelo usuário usando termos como:
"na unidade", "no local", "no endereço", nome da unidade ou número da unidade.
  Exemplo:
  Entrada: "Quero marcar na unidade Centro"
  Saída esperada: 3 
  (se o id da unidade Centro for 3. Sempre em número, não string. Não retorne com aspas.)
  Exemplo alternativo:
  Mensagem anterior da assistente: "Temos um horário disponível na Areia Branca às 10h." 
  Resposta do usuário: "Pode ser"
  Saída esperada: 2 (se o id da unidade Areia Branca for 2)
  Entrada 2: "Quero marcar uma consulta com dr Acrisio joao"
  Saída: null
  Exemplo alternativo:
  Mensagem anterior da assistente: "1-Tobias barreto com dr João dia 20/03 ás 13:00 /n 2-Areia branca com dr Fernanda dia 21 ás 13:00"
  Resposta do usuário: "1"
  Saída esperada: 3 (o valor da unidade Tobias barreto é 3)
  Unidades disponíveis: ${formattedUnidades}
  fique atento ao preenchimento da unidade em ${userSession.idUnidade} e ao contexto ${userSession.context}`
  
          },
          { role: "user", content: body },
      ],
  });
  
  console.log("Unidade detectada:", paramsUnidade.choices[0].message.content);
  let unidadeId = paramsUnidade.choices[0].message.content.trim();
  console.log("Unidade detectada:", unidadeId)
  unidadeId = unidadeId !== "null" ? Number(unidadeId) : null;
  if (unidadeId !== null && !isNaN(unidadeId)) {
    console.log("Unidade veio no formato correto")
      userSession.idUnidade = unidadeId;
      const resultado = processaEscolhaUnidade(unidadeId)
  } else {
      console.log("Unidade não detectada");
  }

  if (userSession.convenioId !== null && userSession.convenioId !== undefined && userSession.idUnidade) {
    try {
      console.log("🚀 Entrou no bloco de verificação!");
  
      if (userSession.convenioId == 0) {
        console.log("📌 convenioId é 0. Atualizando para unidade correta...");
  
        if (userSession.idUnidade == 1) {
          userSession.convenioId = 66;
        } else if (userSession.idUnidade == 2) {
          userSession.convenioId = 67;
        } else if (userSession.idUnidade == 3) {
          userSession.convenioId = 79;
        }
  
        console.log("✅ convenioId atualizado para:", userSession.convenioId);
        getValorByConvenio(); // Agora deve ser chamado
      } else {
        console.log("⚠️ convenioId não é 0. Nada foi alterado.");
      }
    } catch (error) {
      console.error("❌ Erro ao atualizar o convenio:", error);
    }
  } else {
    console.log("⚠️ userSession.convenioId ou userSession.idUnidade estão indefinidos. Pulando atualização.");
  }
    
    const paramsProfessional = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Você é responsável por extrair o id do profissional EXPLICITAMENTE escolhido pelo paciente. Caso identifique o profissional, retorne UNICAMENTE o seu id. Caso não tenha EXPLICITAMENTE encontrado um profissional, retorne null. Lembre-se que escolher uma especialidade não significa escolher o profissional. Exemplo de aplicação:
          Entrada: "Quero marcar com o Dr. Acrisio Joao"
          Saída esperada: 233 (se o id do Dr. Acrisio Joao for 233)

          Exemplo alternativo:
          Entrada: "Quero marcar com um cardiologista"
          Saída esperada: null

          Profissionais disponíveis: ${format1Professionals}. Aqui está o Fluxo de conversa: ${userSession.context}
        `
        },
        {
          role: "user",
          content: body,
        },
      ],
    });

    let professionalId = paramsProfessional.choices[0].message.content.trim(); 
    //console.log("📋 Lista de profissionais carregada:", JSON.stringify(profissionaisData, null, 2), "Sucesso");
    console.log("🧐 Profissional identificado:", professionalId);
    if (professionalId !== null) {
      console.log("Entrou na verificação do profissional")
      let profissionalEncontrado = profissionaisData.find(pro => pro.idProfissional === professionalId);
      if (profissionalEncontrado) {
        userSession.professionalId = profissionalEncontrado.idProfissional;
        console.log("O profissional foi encontrado na lista")
        // Se o usuário escolheu um médico, garantir que um procedimento associado seja definido
        if (!userSession.procedureId && profissionalEncontrado.especialidades.length > 0) {
          userSession.procedureId = profissionalEncontrado.especialidades[0].idEspecialidade;
          console.log("Associado procedureId:", userSession.procedureId);
        }
      } else{
        console.log("Profissional não foi identificado na lista")
      }
    }

    const paramsShift = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Você é responsável por extrair o turno que o usuario vai querer marcar sua consulta ou exame a partir de um fluxo de conversa abaixo entre o usuario e uma IA. o turno pode ser manha tarde o noite, se for manha retorne "1", se for tarde retorne "2". Se não identificar nenhum turno na mensagem retorne "null".
        Entrada:
        "Quero marcar pela manhã"
        Saída esperada: 1
        Entrada2:
        "Pode ser pela tarde?"
        Saída esperada: 2
        Entrada3: 
        "Quero marcar uma consulta para quarta"
        Saída esperada: null
        Fluxo de conversa:
        ${userSession.context}
        `
        },
        {
          role: "user",
          content: body,
        },
      ],
    });

    const shift = paramsShift.choices[0].message.content.trim();

    if (shift !== "null") {
      userSession.shift = shift
    }
   
  
  let dayOfToday = getDayOfWeek(new Date() - 1);
  console.log(new Date())
  console.log("Today is :"+ dayOfToday)     ;
  let completionHorarios = [];
  let agendaData;

  if(userSession.procedureId && userSession.professionalId && !userSession.idUnidade){
    console.log("Buscando horários disponíveis p/ profissional desejado...");
    try{
      agendaData = await buscarHorariosProfissional(userSession.professionalId, userSession.procedureId);
      console.log("Horários disponíveis p/ profissional desejado:", agendaData);
      if (agendaData.length > 0) {
        const mensagemHorarios = agendaData.slice(0, 3).map((h, index) => 
          `${index + 1}. 📍 Unidade: ${h.unidade}\n📅 Data: ${formatarData(h.dataAgenda, "extenso")}\n⏰ Horário: ${h.horaAgenda}H`
      ).join("\n\n");
  
        const mensagem = ` Voce é uma assistente de uma clínica e seu papel é mandar uma mensagem para o paciente informando os horários disponíveis do profissional que ele selecionou. Aqui estão os próximos horários disponíveis:\n\n${mensagemHorarios}\n\n Peça para que o paciente escolha o melhor horário para ele.`;
        const completionHorario = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: mensagem }
          ]
        });
        console.log("Mensagem para o paciente:", completionHorario.choices[0].message.content);
        if(userSession.convenioId !== 0){
          return "Você gostaria de realizar essa consulta particular ou pelo plano de saúde ? \n ( Caso seja plano de saúde, poderia nos dizer qual o seu plano ? )"
        }
        return completionHorario.choices[0].message.content
      } else if (agendaData.length === 0) {
        const promptSemHorario = `Diga SEMPRE que Infelizmente, não encontramos horários disponíveis para a data escolhida.  
    Por favor, escolha uma nova data para verificarmos a disponibilidade.  
    Sugira uma data futura que funcione melhor para você.`;
    
        const completionSemHorario = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: promptSemHorario }
            ]
        });
        console.log("Mensagem para reagendamento:", completionSemHorario.choices[0].message.content);
        if(userSession.convenioId !== 0){
          return "Você gostaria de realizar essa consulta particular ou pelo plano de saúde ? \n ( Caso seja plano de saúde, poderia nos dizer qual o seu plano ? )"
        }
        console.log("Transferindo para atendente humano...");
        await client.addOrRemoveLabels(from, [{labelId: '7' , type:'add'}]);

          await client.sendText(from, "✅ Estamos te transferindo para uma atendente humana para finalizar o agendamento para o procedimento escolhido. Por favor, aguarde um momento.");
          ativarAtendimentoHumano(adminId, from)

          return; 
    }
    }catch(error){console.log("❌ Erro ao buscar horários disponíveis p/ profissional desejado:", error)}
  }
  
  if (userSession.procedureId && !userSession.idUnidade && !userSession.professionalId) {
    console.log("Buscando horários disponíveis...");
    
   try{
    if (userSession.idUnidade) {
      console.log(`✅ Unidade já escolhida: ${userSession.idUnidade}. Pulando nova busca.`);
      return;
  }
     agendaData = await retornaHorario()
     console.log("Horários disponíveis:", agendaData);
     console.log(agendaData);
        if (agendaData.length > 0) {
          const promptMensagem = `Você é um assistente de uma clínica.
      Aqui estão os horários disponíveis para a data escolhida:
      ${agendaData.slice(0, 3).map((h, index) => 
        `${index + 1}. 📍 ${h.unidade}: ${formatarData(h.dataAgenda, "extenso")} às ${h.horaAgenda}H com Dr. ${h.nomeProfissional}`
      ).join("\n")} Pergunte em qual unidade ele gostaria de se consultar ( sempre mostrando também  o horário e o profissional que vai realizar, conforme o modelo acima)`
          const completionHorario = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: promptMensagem }
            ]
          });
          console.log("Mensagem para o paciente:", completionHorario.choices[0].message.content);
          if(userSession.convenioId !== 0){
            return "Você gostaria de realizar essa consulta particular ou pelo plano de saúde ? \n ( Caso seja plano de saúde, poderia nos dizer qual o seu plano ? )"
          }
          return completionHorario.choices[0].message.content
        }  else if (agendaData.length === 0) {
          const promptSemHorario = `Diga SEMPRE que Infelizmente, não encontramos horários disponíveis para a data escolhida.  
      Por favor, escolha uma nova data para verificarmos a disponibilidade.  
      Sugira uma data futura que funcione melhor para você.`;
      
          const completionSemHorario = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                  { role: "system", content: promptSemHorario }
              ]
          });
          console.log("Mensagem para reagendamento:", completionSemHorario.choices[0].message.content);
          console.log("Transferindo para atendente humano...");
          await client.addOrRemoveLabels(from, [{labelId: '7' , type:'add'}]);
          await client.sendText(from, "✅ Estamos te transferindo para uma atendente humana para finalizar o agendamento para o procedimento escolhido. Por favor, aguarde um momento.");
          ativarAtendimentoHumano(adminId, from)
          return; 
      }
    } catch (error) {
        console.error("Erro ao buscar horários:", error);
    }}

const paramsHora = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [
    {
      role: "user",
      content: `Voce é responsável por extrair o horário escolhido pelo usuário a partir de um fluxo de conversa abaixo entre o usuario e uma IA. O horário pode aparecer em várias formas, como '10h', '10:00', '10 horas', '10 horas da manhã', '10 horas da tarde', '10 horas da noite', "13:00:00", "10:00:00H" ou até mesmo ter selecionado entre uma lista de opções oferecidas pela assistente dando respostas como "1". Se identificar o horário, retorne UNICAMENTE o horário no formato 00:00:00. Se não identificar nenhum horário, retorne null 
      
      Fluxo de conversa:
      ${userSession.context}
      ` 
      },
      {
        role: "user",
        content: body,
      },
    ],
})

let hora = paramsHora.choices[0].message.content;
if (hora && /^\d{2}:\d{2}:\d{2}$/.test(hora)) {
  console.log("🕒 Hora extraída corretamente:", hora);
  userSession.horaAgenda = hora;
  const resultado = await processaEscolhaHorario(hora);
  console.log("Resultado final:", resultado)
}

    const paramsUserName = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Você é responsável por extrair o nome completo do usuário a partir de um fluxo de conversa abaixo entre o usuario e uma IA. O nome pode aparecer em várias formas, como "Meu nome é João Marcos da Silva", "Sou a Maria", "Você pode me chamar de Carlos", etc. Se identificar o nome do usuário, retorne UNICAMENTE o nome do usuário. Se não identificar nenhum nome, retorne "null".
        Fluxo de conversa:
        ${userSession.context}
        `
        },
        {
          role: "user",
          content: body,
        },
      ],
    });

    let userName = paramsUserName.choices[0].message.content.trim();

    if (userName !== "null") {
      userSession.name = userName
    }

    const paramsCPF = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Você é responsável por extrair o CPF do usuário a partir de um fluxo de conversa abaixo entre o usuario e uma IA. O CPF pode aparecer em várias formas, como 17114536763, 171.145.367-63, 171145367-63, etc. Se identificar o CPF do usuário, retorne UNICAMENTE o CPF do usuário ( sem pontos ou traços e outros caracteres especiais). Se não identificar nenhum CPF, retorne "null".
          Fluxo de conversa para facilitar:
        ${userSession.context}
        `
        },
        {
          role: "user",
          content: body,
        },
      ],
    })
    let cpf = paramsCPF.choices[0].message.content.trim();
    if (cpf !== "null") {
      userSession.cpf = cpf
      }

      const paramsDataNascimento = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Você é responsável por extrair a data de nascimento do usuário a partir de um fluxo de conversa abaixo entre o usuário e uma IA. A data de nascimento pode aparecer em várias formas, como 01/01/1990, 1990-01-01, 1 de janeiro de 1990, etc. Se identificar a data de nascimento do usuário, retorne UNICAMENTE a data de nascimento no formato aaaa-mm-dd. Se não identificar nenhuma data de nascimento, retorne "null".
      Fluxo de conversa para facilitar:
      ${userSession.context}
            `,
          },
          {
            role: "user",
            content: body,
          },
        ],
      });
      
      let dataNascimento = paramsDataNascimento.choices[0].message.content.trim();
      if (dataNascimento !== "null") {
          userSession.nascimento = dataNascimento; // Formato 'yyyy-mm-dd'
        } else {
          console.log("Data inválida detectada:", dataNascimento);
        }
      

        const paramsAtendente = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `Você é responsável por identificar se o usuário deseja falar com uma atendente humana a partir do fluxo de conversa abaixo. 
              
              O usuário pode expressar essa intenção de diversas formas, como:
              - "Quero falar com uma atendente"
              - "Pode me transferir para um humano?"
              - "Preciso de ajuda de um atendente"
              - "Falar com alguém da equipe"
              - "Atendimento humano, por favor"
              
              Se identificar que o usuário quer falar com uma atendente humana, retorne UNICAMENTE "sim".  
              Se o usuário não mencionar isso, retorne UNICAMENTE "não".  
              
              Fluxo de conversa:
              ${userSession.context}
              `
            },
            {
              role: "user",
              content: body,
            },
          ],
        });
        
        let desejaAtendente = paramsAtendente.choices[0].message.content.trim();
        
        if (desejaAtendente === "sim") {
          await client.addOrRemoveLabels(from, [{labelId: '7' , type:'add'}]);
          await client.sendText(from, "✅ Você foi transferido para uma atendente humana. Aguarde um momento.");
          ativarAtendimentoHumano(adminId, from)
          return;
        }



    if (userSession.name && userSession.idUnidade && userSession.idAgenda && userSession.date && userSession.procedureId && userSession.nascimento && userSession.agendado == false) {
      
      const axiosInstance = axios.create({
        timeout: 50000, // Aumentando o timeout para 15 segundos
      });
      
      const marcarHorario = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Você é um assistente de uma clínica. Contexto da conversa: ${userSession.context}. 
                      esta conversa é um chat entre um usuario e uma assistente de clínica a sua função aqui é checar se a assistente 
                      apresentou um horario disponivel para consulta e se logo após o usuario quis confirmar esta consulta
                      para o horário que a assim apresentou, caso sim retorne "true". Caso esse não seja o caso retorne "false"`
          },
          {
            role: "user",
            content: body,
          },
        ],
      });

      let telefoneFormatado = formatarTelefone(from)


      if (marcarHorario.choices[0].message.content == 'true') {


        try {
          const appointmentData = {
            paciente: {
              nome: userSession.name,
              nascimento: userSession.nascimento || null,
              cpf: userSession.cpf || null,
              telefone: telefoneFormatado,
              idConvenio: userSession.convenioId || 79,
            },
            agendamentos: [{
              idAgenda: userSession.idAgenda,
              idUnidade: userSession.idUnidade,
              idProfissional: userSession.professionalId || null,
              idConvenio: userSession.convenioId || 79,
              idProcedimento: userSession.idConsulta || null,
              dataAgenda: userSession.date,
              horaAgenda: userSession.horaAgenda || null,
            }]
          };

          console.log("Enviando requisição para marcar consulta...", appointmentData);
          const response = await axiosInstance.post(`https://cpp.focuscw.com.br/datasnap/rest/TCalendarController/agendamentoSemPaciente/`, appointmentData)
          console.log("Resposta da API marcação:", response.data);

          const marcado = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `Você é um assistente de uma clínica. 
                          Quero que gere uma mensagem dizendo que a consulta esta marcada. A mensagem tem que conter data, hora, dia da semana, nome do Profissional, valor. Utilize como mensagem final a frase: "*CPP \n cuidando sempre de você 😊*" NUNCA USE "*" , "**" OU ATÉ MESMO "#"
                          A data do agendamento é ${formatarData(userSession.date, "extenso")}, com início às ${userSession.horaAgenda}H o profissional é ${userSession.professionalId} e o valor é R$ ${userSession.valor} ( Nunca informe o valor null ). NUNCA USE NEGRITO, ASTERÍSCO, ITÁLICO, SUBLINHADO, HASHTAGS OU QUALQUER TIPO DE FORMATAÇÃO ESPECIAL/SÍMBOLO DE MARCAÇÃO EM NENHUMA DAS MENSAGENS E QUANDO FOR MANDAR A MENSAGEM DE CONFIRMAÇÃO LEMBRE-SE DE INCLUIR A DATA, HORÁRIO, UNIDADE, MÉDICO E VALOR ( e falar que o atendimento é por ordem de chegada ). Contexto da conversa: ${userSession.context}.
                         `
              },
              {
                role: "user",
                content: body,
              },
            ],
          });
          userSession.agendado = true
          console.log("o userSession:", userSession)
          console.log("Agendamento marcado com sucesso")
          console.log("Resposta da API:", marcado.data.choices[0].message.content);
         

          return marcado.choices[0].message.content;
        } catch (error) {
          if (error.response && error.response.status === 400) {
            await client.sendText(from, 'Desculpe, não conseguimo realizar o seu agendamento. Para te ajudar com esse processo, estou te encaminhando para uma atendente humana');
            ativarAtendimentoHumano(adminId, from)
            console.log("Não marcou")
            return
          } else {
            //await client.sendText(from, 'Tivemos um pequeno problema ao marcar o horário. Por favor, tente novamente ou digite "falar com atendente" para que eu possa te transferir para uma atendente humana.');
          }
        }
      }
    }


    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
  content: `Você é um assistente virtual da CPP ( Se apresente para o usuário quando o usuário mandar a primeira mensagem ).Sempre se apresente como assistente virtual da CPP, não Clinica Popular de Petrolina. Sua função é atender os clientes, marcar consultas e exames, e tirar dúvidas gerais. Responda de maneira humanizada e suave, mas NÃO EXAGERE NO USO DE EMOJIS.NUNCA USE "*" , "**" OU ATÉ MESMO "#". OBSERVAÇÃO IMPORTANTE: VOCE SÓ PODE DEIXAR O PACIENTE MARCAR UMA CONSULTA OU PROCEDIMENTO QUE ESTEJAM DENTRO DAS CADASTRADAS NA CLÍNICA EM ${format1Procedures}. Caso o paciente queira marcar algo fora dessa lista, diga que voce como IA não está reconhecendo a consulta mas que para ele ter a melhor experiencia, precisa falar com uma atendente humana ( pergunte se ele gostaria de ser atendido por uma atendente humana). LEMBRE SEMPRE que agora é ${today} e FIQUE EM MENTE QUE HOJE é ${dateOnly}. Caso esteja mandando a mensagem de confirmação de consulta, lembre de adicionar no final o SLOGAN "*CPP \n cuidando sempre de você 😊*". NUNCA em NENHUMA hipótese fale que voce é GPT. Tenha em mente que para marcar um exame, temos que ter em mente a especialidade(id) escolhido pelo paciente, data da consulta, CPF, nome completo e data de nascimento do paciente.  Lembre-se também de sempre perguntar o nome completo da pessoa antes de tudo para ai sim proseguir com o fluxo de conversa (SEMPRE preste atencao no contexto da conversa pra ver se o nome ja não foi informado, pra NUNCA precisar ficar pedindo o nome toda hora ao usuario e sempre chame o paciente pelo primeiro nome). os convenios/planos disponíveis são ${formattedConvenios}. Caso o CPF seja igual a null, solicite o CPF do paciente. Aqui está o CPF: ${userSession.cpf}. NUNCA SE ESQUEÇA DE PERGUNTAR A DATA DE NASCIMENTO. Caso a data de nascimento seja igual a null, solicite também a data de nascimento do paciente. Aqui está a data de nascimento ${userSession.nascimento}.
   Caso o paciente pergunte o valor da consulta, pode informar para ele o valor SEMPRE contido em: R$ ${userSession.valor} ( Nunca informe o valor null ), sempre antes de falar o valor verifique se o campo ${userSession.valor} esta preenchido, caso não esteja, pergunte sobre a unidade que ele gostaria de se consultar antes.NUNCA informe o valor null para o paciente. Caso o paciente manifeste interesse ESPECIFICAMENTE em marcar um RAIO X ( somente e explicitamente com o nome Raio X ), diga que para esse procedimento não é realizado o agendamento pois é realizado por ordem de chegada na unidade Joaquim Nabuco. SEMPRE antes de mandar os horários certifique-se de que o paciente já tenha respondido se quer marcar pelo particular ou pelo plano em ${userSession.convenioId}. NUNCA USE NEGRITO, ASTERÍSCO, ITÁLICO, SUBLINHADO, HASHTAGS OU QUALQUER TIPO DE FORMATAÇÃO ESPECIAL/SÍMBOLO DE MARCAÇÃO EM NENHUMA DAS MENSAGENS E QUANDO FOR MANDAR A MENSAGEM DE CONFIRMAÇÃO LEMBRE-SE DE INCLUIR A DATA, HORÁRIO, UNIDADE, MÉDICO E VALOR ( e falar que o atendimento é por ordem de chegada ).
   Caso o paciente pergunte se voce faz o lembrete da consulta, diga que sim, voce faz um dia antes e no dia. Os profissionais disponíveis na clínica são esses ${formattedProfessionals}, SEMPRE que o paciente quiser marcar com algum especialista fora dessa lista diga que como IA voce não reconheceu o profissional, mas para proporcionar uma melhor experiencia para ele, precisa falar com atendente humana ( pergunte se ele gostaria de falar com atendente humana ), do mesmo modo, sempre que o paciente quiser fazer algo fora do contexto dessa atendente virtual ( como pedir nota fiscal, pedir relatório, documento do exame, comprovante ), pergunte se o paciente gostaria de ser atendido por uma atendente humana. contexto da conversa até aqui: ${userSession.context}
        `
        },
        {
          role: "user",
          content: body,
        },
      ],
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Erro ao obter detalhes da clínica:', error);
    
  }
}



module.exports = { detectIntent };
