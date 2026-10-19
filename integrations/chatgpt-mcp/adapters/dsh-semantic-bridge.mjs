/**
 * Narrow semantic adapter over the official DSH Web Host services.
 *
 * The embedding host must call this only after authenticating the dedicated
 * private mTLS peer. Caller grants and revocation remain the Remote-Ops
 * responsibility; this adapter independently proves Workspace membership and
 * the requested Lead identity using DSH's official registries/projections.
 */
import {projectAgentTeam} from './agent-teams-read-model.mjs';

const deny=()=>{throw Error('DeepHarness semantic operation denied');};
const validId=value=>typeof value==='string'&&value.length>0&&value.length<=256;
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>{
  if(!record(value)||Object.keys(value).some(key=>!keys.includes(key)))deny();
};
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const DEFAULT_MESSAGES=50,MAX_MESSAGES=100,MAX_WORKSPACE_SESSIONS=256,MAX_INSTRUCTION_CHARS=8000;
const validatedTeam=(leadSessionId,projection)=>{
  try{return projectAgentTeam(leadSessionId,projection);}
  catch{deny();}
};

export function createDshSemanticBridge({workspaceRegistry,sessionController,checkHost=()=>{}}={}) {
  if(typeof workspaceRegistry?.get!=='function'||typeof sessionController?.projections!=='function'||
     typeof sessionController?.page!=='function'||typeof sessionController?.prompt!=='function'||
     typeof checkHost!=='function')deny();

  const workspaceFor=workspaceId=>{
    checkHost();
    if(!validId(workspaceId))deny();
    const workspace=workspaceRegistry.get(workspaceId);
    if(!workspace||workspace.id!==workspaceId||!Array.isArray(workspace.sessionIds)||
       workspace.sessionIds.length>MAX_WORKSPACE_SESSIONS)deny();
    return workspace;
  };
  const leadProjection=async(workspaceId,leadSessionId)=>{
    if(!validId(leadSessionId))deny();
    const workspace=workspaceFor(workspaceId);
    if(!workspace.sessionIds.includes(leadSessionId))deny();
    const snapshot=await sessionController.projections({sessionId:leadSessionId},new AbortController().signal);
    checkHost();
    const current=workspaceFor(workspaceId);
    if(current!==workspace||!current.sessionIds.includes(leadSessionId))deny();
    if(snapshot?.kind!=='sequenced'||!Number.isSafeInteger(snapshot.asOfSeq)||snapshot.asOfSeq< -1||
       !snapshot.values?.agentTeam)deny();
    const team=validatedTeam(leadSessionId,snapshot.values.agentTeam);
    return {workspace,throughSeq:snapshot.asOfSeq,team};
  };

  async function listTeams(input) {
    exact(input,['workspaceId']);
    const workspace=workspaceFor(input.workspaceId),memberIds=[...workspace.sessionIds],teams=[];
    // Freeze the enumerated membership, not merely the registry object reference:
    // WorkspaceEntity can mutate its sessionIds in place during an async read.
    const checkMembership=()=>{
      const current=workspaceFor(input.workspaceId);
      if(current!==workspace||current.sessionIds.length!==memberIds.length||
         current.sessionIds.some((id,index)=>id!==memberIds[index]))deny();
    };
    for(const sessionId of memberIds) {
      const snapshot=await sessionController.projections({sessionId},new AbortController().signal);
      checkMembership();
      if(snapshot?.kind==='sequenced'&&snapshot.values?.agentTeam) {
        teams.push(validatedTeam(sessionId,snapshot.values.agentTeam));
      }
    }
    checkMembership();
    return teams;
  }

  async function getTeamStatus(input) {
    exact(input,['workspaceId','leadSessionId']);
    return (await leadProjection(input.workspaceId,input.leadSessionId)).team;
  }

  async function listTasks(input) {
    exact(input,['workspaceId','leadSessionId']);
    return (await leadProjection(input.workspaceId,input.leadSessionId)).team.tasks;
  }

  async function readLeadChat(input) {
    exact(input,['workspaceId','leadSessionId','maxMessages']);
    const {workspace,throughSeq}=await leadProjection(input.workspaceId,input.leadSessionId);
    const maxMessages=input.maxMessages??DEFAULT_MESSAGES;
    if(!Number.isSafeInteger(maxMessages)||maxMessages<1||maxMessages>MAX_MESSAGES)deny();
    const result=await sessionController.page({
      address:{kind:'session',sessionId:input.leadSessionId},throughSeq,maxMessages,
    },new AbortController().signal);
    checkHost();
    if(!record(result)||!Array.isArray(result.records)||result.records.length>MAX_MESSAGES||
       typeof result.hasMore!=='boolean')deny();
    // Recheck the live registry after the async history read to avoid returning
    // messages after workspace removal or membership replacement.
    const current=workspaceFor(input.workspaceId);
    if(current!==workspace||!current.sessionIds.includes(input.leadSessionId))deny();
    const messages=[];
    for(const entry of result.records) {
      const event=entry?.event;
      const user=event?.type==='user/message';
      if(!user&&event?.type!=='assistant/message')continue;
      const message=user?event.data:event.data?.message;
      if(message?.role!==(user?'user':'assistant')||!Array.isArray(message.content))continue;
      const text=message.content.filter(part=>part?.type==='text'&&typeof part.text==='string')
        .map(part=>part.text).join('\n').slice(0,6000);
      if(text)messages.push({role:message.role,text});
    }
    return {messages:messages.slice(-maxMessages),hasMore:result.hasMore};
  }

  async function sendLeadInstruction(input) {
    exact(input,['workspaceId','leadSessionId','requestId','text']);
    if(!uuid(input.requestId)||typeof input.text!=='string'||input.text.trim().length===0||
       input.text.length>MAX_INSTRUCTION_CHARS)deny();
    const {workspace}=await leadProjection(input.workspaceId,input.leadSessionId);
    if(workspaceFor(input.workspaceId)!==workspace||!workspace.sessionIds.includes(input.leadSessionId))deny();
    // The DSH API's requestId is persisted on the accepted user message and
    // deduplicated by SessionController, making transport retries safe.
    const receipt=await sessionController.prompt({
      sessionId:input.leadSessionId,requestId:input.requestId,mode:'queue',
      content:[{type:'text',text:input.text}],
    },new AbortController().signal);
    checkHost();
    if(receipt?.accepted!==true)deny();
    return {accepted:true,requestId:input.requestId};
  }

  return Object.freeze({listTeams,getTeamStatus,listTasks,readLeadChat,sendLeadInstruction});
}
