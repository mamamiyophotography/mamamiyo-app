const COOLDOWN_MS=30_000;

export async function reserveNotification(db:any,bookingId:string,channel:string){
  return db.$transaction(async(tx:any)=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${bookingId}:${channel}`}))`;
    const recent=await tx.notificationLog.findFirst({where:{bookingId,channel,status:{in:['sending','sent']},sentAt:{gte:new Date(Date.now()-COOLDOWN_MS)}},orderBy:{sentAt:'desc'}});
    if(recent)throw new Error('This message was already sent or started within the last 30 seconds. Please wait before trying again.');
    return tx.notificationLog.create({data:{bookingId,channel,message:'Admin notification',status:'sending'}});
  });
}
export async function finishNotification(db:any,id:string,status:'sent'|'failed',message:string){
  await db.notificationLog.update({where:{id},data:{status,message}});
}
