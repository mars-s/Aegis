export {decodeHostEvent,HostEventSchema} from './http.js';
export type {HostEvent,BoardPatch} from './http.js';
// SSE framing is independent of network chunk boundaries and ignores comment pings.
export class EventDecoder {
  private buffer = '';
  push(chunk: string): string[] {
    this.buffer += chunk;
    const messages:string[]=[];
    for (;;) {
      const boundary=/\r?\n\r?\n/.exec(this.buffer);
      if (!boundary) return messages;
      const frame=this.buffer.slice(0,boundary.index);
      this.buffer=this.buffer.slice(boundary.index+boundary[0].length);
      const data=frame.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).replace(/^ /,'')).join('\n');
      if(data) messages.push(data);
    }
  }
  reset():void { this.buffer=''; }
}
