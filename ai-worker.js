/**
 * Worker boundary for checkers search. Keep expensive move selection off the UI thread and return the request identifier with the result.
 */
import { chooseMove } from './engine.mjs';
self.onmessage=({data})=>{
    try {self.postMessage({id:data.id,move:chooseMove(data.state)});}
    catch(error){self.postMessage({id:data.id,error:error.message});}
};
