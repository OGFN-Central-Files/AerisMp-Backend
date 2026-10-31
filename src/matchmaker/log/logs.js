import mainLog from '../../Utils/log.js';

// All matchmaker logs are buffered through the main logger
const log = {
  mm(msg)         { mainLog.request(`mm: ${msg}`); },
  http(msg)       { mainLog.request(`http: ${msg}`); },
  error(msg)      { mainLog.error(msg); },
  joinable(msg)   { mainLog.info(`join: ${msg}`); },
  notjoinable(msg){ mainLog.info(`nojoin: ${msg}`); },
  queue(msg)      { mainLog.info(`queued: ${msg}`); },
  unqueue(msg)    { mainLog.info(`unqueued: ${msg}`); },
};

export default log;
