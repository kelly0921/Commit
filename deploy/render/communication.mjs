// Deployment capability adapter; saved notification consent and Activity stay intact.
import {CommunicationService} from '../../dist/src/product/communication.js';

export class RenderCommunicationService extends CommunicationService {
  constructor(database,config={},enabled=false){super(database,enabled?config:{});this.enabled=enabled;}
  preferences(session){
    const preferences=super.preferences(session);
    return {...preferences,pushEnabled:this.enabled&&preferences.pushEnabled};
  }
}
