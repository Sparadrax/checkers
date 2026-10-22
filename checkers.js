/**
 * Checkers game. The rules engine owns legal moves; the page renders the board and delegates computer decisions to a worker.
 */
import * as THREE from 'three';
import { OrbitControls } from '../../Lib/Three/OrbitControls.js';
import { newGame, legalMoves, applyMove, outcome, chooseMove, sideOf } from './engine.mjs';

const view=document.getElementById('checkers-view');
const palette=getComputedStyle(document.documentElement);
/**
 * Read a shared CSS palette value and convert it to a Three.js color.
 *
 * @param name - CSS custom-property name or display label used by this operation.
 * @returns Three.js color parsed from the shared CSS palette.
 */
const themeColor=(name)=>new THREE.Color(palette.getPropertyValue(name).trim());
let state=newGame(),player=1,selected=null,prefix=[],candidates=[],thinking=false,worker=null,request=0,flipped=false;
const snapshots=[],history=[];
/**
 * Convert the side indicator to the displayed player-color name.
 *
 * @param side - Player side represented by the board engine.
 * @returns Human-readable name of the side.
 */
const name=(side)=>side===1?'Red':'Black';
/**
 * Convert a board-array index to its human-readable square label.
 *
 * @param index - Zero-based board, point, or instance index.
 * @returns Human-readable notation for the board square.
 */
const notation=(index)=>String.fromCharCode(97+index%8)+(8-Math.floor(index/8));
/**
 * Convert a board-array index to its displayed position.
 *
 * @param index - Zero-based board, point, or instance index.
 * @returns Position corresponding to the supplied board index.
 */
const position=(index)=>new THREE.Vector3(index%8-3.5,0,Math.floor(index/8)-3.5);
const scene=new THREE.Scene();scene.background=themeColor('--site-bg');
const camera=new THREE.PerspectiveCamera(42,1,0.1,100);
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:true});}
catch(error){const message=document.getElementById('scene-error');message.hidden=false;message.textContent='Unable to start the board. Please enable WebGL in your browser.';throw error;}
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
const canvas=renderer.domElement;canvas.setAttribute('aria-label','Checkers board: select a piece and click a highlighted destination');view.appendChild(canvas);
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=7;controls.maxDistance=30;controls.maxPolarAngle=Math.PI*.44;
scene.add(new THREE.HemisphereLight(0xffffff,0x283746,2.8));
const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-3,10,6);scene.add(light);
const redMaterial=new THREE.MeshStandardMaterial({color:0xc85455,roughness:.4,metalness:.15});
const blackMaterial=new THREE.MeshStandardMaterial({color:0x34475e,roughness:.35,metalness:.25});
const crownMaterial=new THREE.MeshStandardMaterial({color:0xecc770,metalness:.5,roughness:.3});
const darkMaterial=new THREE.MeshStandardMaterial({color:themeColor('--site-surface')});
const lightMaterial=new THREE.MeshStandardMaterial({color:0x72868d});
const selectedMaterial=new THREE.MeshStandardMaterial({color:themeColor('--site-accent')});
const lastMaterial=new THREE.MeshStandardMaterial({color:0x426b68});
const markerMaterial=new THREE.MeshBasicMaterial({color:themeColor('--site-accent'),side:THREE.DoubleSide});
const tileGeometry=new THREE.BoxGeometry(1,.16,1),discGeometry=new THREE.CylinderGeometry(.36,.39,.18,32),rimGeometry=new THREE.TorusGeometry(.26,.025,8,32),hintGeometry=new THREE.CircleGeometry(.14,24);
const tiles=[],pieces=new THREE.Group(),hints=new THREE.Group();scene.add(pieces,hints);
for(let index=0;index<64;index++){
    const material=(Math.floor(index/8)+index%8)%2?darkMaterial:lightMaterial;
    const tile=new THREE.Mesh(tileGeometry,material);tile.position.copy(position(index));tile.position.y=-.08;tile.userData={index,base:material};tiles.push(tile);scene.add(tile);
}
const frame=new THREE.Mesh(new THREE.BoxGeometry(8.6,.25,8.6),new THREE.MeshStandardMaterial({color:themeColor('--site-border')}));frame.position.y=-.24;scene.add(frame);
/**
 * Create and position a board label in the scene.
 *
 * @param text - Text to parse or display.
 * @param x - X coordinate in the operation's local coordinate system.
 * @param z - Z coordinate in the operation's local coordinate system.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function addLabel(text,x,z){
    const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d');ctx.fillStyle='#a8b8ca';ctx.font='bold 40px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,32,32);
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture}));sprite.position.set(x,.02,z);sprite.scale.set(.28,.28,1);scene.add(sprite);
}
for(let i=0;i<8;i++){for(const z of [-4.18,4.18])addLabel(String.fromCharCode(97+i),i-3.5,z);for(const x of [-4.18,4.18])addLabel(String(8-i),x,i-3.5);}
/**
 * Build the displayed position, including any capture sequence being previewed.
 *
 * Inputs: None; uses enclosing state where needed.
 * @returns Board array reflecting the current selection or capture preview.
 */
function displayedBoard(){
    const board=state.board.slice();
    if(prefix.length>1){
        const piece=board[prefix[0]];board[prefix[0]]=0;
        for(let i=0;i<prefix.length-1;i++)board[candidates[0].captures[i]]=0;
        board[prefix.at(-1)]=piece;
    }
    return board;
}
/**
 * Synchronize piece meshes, selection highlights, status, and move history with game state.
 *
 * Inputs: None; uses enclosing state where needed.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function refresh(){
    pieces.clear();hints.clear();const board=displayedBoard();
    for(const tile of tiles)tile.material=tile.userData.base;
    const last=history.at(-1)?.move;
    if(last)for(const index of last.path)tiles[index].material=lastMaterial;
    if(selected!==null)tiles[selected].material=selectedMaterial;
    board.forEach((piece,index)=>{
        if(!piece)return;
        const group=new THREE.Group();const material=piece>0?redMaterial:blackMaterial;
        const disc=new THREE.Mesh(discGeometry,material);disc.position.y=.1;group.add(disc);
        const rim=new THREE.Mesh(rimGeometry,Math.abs(piece)===2?crownMaterial:material);rim.rotation.x=Math.PI/2;rim.position.y=.2;group.add(rim);
        if(Math.abs(piece)===2){const top=new THREE.Mesh(discGeometry,material);top.scale.set(.85,1,.85);top.position.y=.27;group.add(top);rim.position.y=.37;}
        group.position.copy(position(index));group.userData.index=index;pieces.add(group);
    });
    if(selected!==null)for(const index of new Set(candidates.map(move=>move.path[prefix.length]).filter(index=>index!==undefined))){const hint=new THREE.Mesh(hintGeometry,markerMaterial);hint.rotation.x=-Math.PI/2;hint.position.copy(position(index));hint.position.y=.015;hints.add(hint);}
    const result=outcome(state);
    document.getElementById('game-status').textContent=result?(result.winner?`${name(result.winner)} wins${result.winner===player?' — you win!':' — AI wins'}`:`Draw — ${result.draw}`):`${state.turn===player?'Your turn':'AI thinking'} — ${name(state.turn)}`;
    document.getElementById('selection-status').textContent=prefix.length>1?'Continue jumping with the highlighted piece.':(!result&&legalMoves(state)[0]?.captures.length?'Capture required — select a capturing piece.':'Select a piece, then a highlighted square.');
    document.getElementById('piece-count').textContent=`Red: ${board.filter(p=>p>0).length} · Black: ${board.filter(p=>p<0).length}`;
    document.getElementById('undo').disabled=!snapshots.some(item=>item.turn===player)&&prefix.length<2;
    const list=document.getElementById('move-history');list.replaceChildren();
    if(!history.length){const p=document.createElement('p');p.textContent='No moves yet.';list.appendChild(p);}
    history.forEach((entry,i)=>{const row=document.createElement('div');row.className='move-row';for(const text of [`${i+1}.`,name(entry.side),entry.move.path.map(notation).join(entry.move.captures.length?' × ':' – ')]){const span=document.createElement('span');span.textContent=text;row.appendChild(span);}list.appendChild(row);});list.scrollTop=list.scrollHeight;
}
/**
 * Clear the selected piece and any unfinished multi-jump prefix.
 *
 * Inputs: None; uses enclosing state where needed.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function clearSelection(){selected=null;prefix=[];candidates=[];}
/**
 * Invalidate a pending computer search before changing the game position.
 *
 * Inputs: None; uses enclosing state where needed.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function cancelAI(){request++;worker?.terminate();worker=null;thinking=false;}
/**
 * Save undo history, apply the completed move, and hand play to the next side.
 *
 * @param move - Legal move descriptor containing origin, destination/path, and capture or promotion data.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function commit(move){snapshots.push(state);history.push({side:state.turn,move});state=applyMove(state,move);clearSelection();refresh();requestAI();}
/**
 * Ask the worker for a move only when it is the computer's turn.
 *
 * Inputs: None; uses enclosing state where needed.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function requestAI(){
    if(state.turn===player||outcome(state))return;
    cancelAI();thinking=true;const id=request;
    /**
     * Apply the computer result only if its search request still matches the current game.
     *
     * @param move - Legal move descriptor containing origin, destination/path, and capture or promotion data.
     * @returns No value is returned; updates the current state, scene, or interface.
     */
    const finish=(move)=>{if(id!==request)return;cancelAI();if(move)commit(move);};
    /**
     * Run the fallback computer search when the worker cannot provide a result.
     *
     * Inputs: None; uses enclosing state where needed.
     * @returns No value is returned; updates the current state, scene, or interface.
     */
    const fallback=()=>{worker?.terminate();worker=null;setTimeout(()=>{if(id===request)finish(chooseMove(state,{maxDepth:3,timeLimit:100}));},30);};
    try{worker=new Worker(new URL('./ai-worker.js',import.meta.url),{type:'module'});worker.onmessage=({data})=>{if(id!==request||data.id!==id)return;if(data.error)fallback();else finish(data.move);};worker.onerror=(event)=>{event.preventDefault();if(id===request)fallback();};worker.postMessage({id,state});}catch{fallback();}
}
/**
 * Interpret a board click as piece selection or a step in a legal move sequence.
 *
 * @param index - Zero-based board, point, or instance index.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function chooseSquare(index){
    if(thinking||state.turn!==player||outcome(state))return;
    const matching=candidates.filter(move=>move.path[prefix.length]===index);
    if(selected!==null&&matching.length){
        prefix.push(index);candidates=matching;selected=index;
        const complete=matching.find(move=>move.path.length===prefix.length);
        if(complete)commit(complete);else refresh();return;
    }
    if(prefix.length>1)return;
    const options=legalMoves(state).filter(move=>move.from===index);
    if(sideOf(state.board[index])===player&&options.length&&selected!==index){selected=index;prefix=[index];candidates=options;}else clearSelection();
    refresh();
}
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0),hit=new THREE.Vector3();let start=null;
canvas.addEventListener('pointerdown',event=>{start=event.button===0&&event.isPrimary?{id:event.pointerId,x:event.clientX,y:event.clientY}:null;});
canvas.addEventListener('pointercancel',()=>{start=null;});
canvas.addEventListener('pointerup',event=>{
    const down=start;start=null;if(!down||down.id!==event.pointerId||Math.hypot(event.clientX-down.x,event.clientY-down.y)>5)return;
    const rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);camera.updateMatrixWorld();raycaster.setFromCamera(pointer,camera);
    const pieceHit=raycaster.intersectObjects(pieces.children,true)[0];
    if(pieceHit){let object=pieceHit.object;while(object&&object.userData.index===undefined)object=object.parent;if(object){chooseSquare(object.userData.index);return;}}
    if(!raycaster.ray.intersectPlane(plane,hit))return;const c=Math.floor(hit.x+4),r=Math.floor(hit.z+4);if(c>=0&&c<8&&r>=0&&r<8)chooseSquare(r*8+c);
});
/**
 * Fit the board and orient the camera for the chosen side.
 *
 * Inputs: None; uses enclosing state where needed.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function setCamera(){const distance=Math.max(12.5,10/Math.max(camera.aspect,.4));camera.position.set(0,distance*.85,distance*(flipped?-.78:.78));controls.target.set(0,0,0);controls.update();}
/**
 * Start a new game and discard pending AI results and old move history.
 *
 * Inputs: None; uses enclosing state where needed.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function reset(){cancelAI();player=Number(document.getElementById('player-color').value);state=newGame();snapshots.length=0;history.length=0;clearSelection();flipped=player===-1;setCamera();refresh();requestAI();}
document.getElementById('player-color').addEventListener('change',reset);
document.getElementById('new-game').addEventListener('click',reset);
document.getElementById('flip').addEventListener('click',()=>{flipped=!flipped;setCamera();});
document.getElementById('undo').addEventListener('click',()=>{
    if(prefix.length>1){clearSelection();refresh();return;}
    if(!snapshots.some(item=>item.turn===player))return;
    cancelAI();do{state=snapshots.pop();history.pop();}while(state.turn!==player&&snapshots.length);clearSelection();refresh();
});
/**
 * Synchronize renderer dimensions and camera projection with the available container size.
 *
 * Inputs: None; uses enclosing state where needed.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function resize(){const w=Math.max(view.clientWidth,1),h=Math.max(view.clientHeight,1);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);setCamera();}
// Recalculate view dimensions when the surrounding layout changes.
new ResizeObserver(resize).observe(view);resize();reset();
// Keep visual frames separate from the simulation's own update timing.
renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
