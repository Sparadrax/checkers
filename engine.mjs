/**
 * Pure checkers rules and search. The 64-square board uses positive/negative pieces for sides and magnitude 1/2 for men/kings.
 */
export 
/**
 * Read the side from the sign of a checkers piece value.
 *
 * @param piece - Signed piece value: sign identifies the side; magnitude one is a man and two is a king.
 * @returns Side indicator: positive one, negative one, or zero for an empty square.
 */
const sideOf = (piece) => Math.sign(piece);
export 
/**
 * Encode the side to move and board for repetition detection.
 *
 * @param state - Checkers position with its signed-piece board, side to move, quiet counter, and repetition history.
 * @returns Position key including the side to move and every board square.
 */
const keyOf = (state) => `${state.turn}:${state.board.join(',')}`;
/**
 * Create the initial board and seed repetition history with the starting position.
 *
 * Inputs: None; uses enclosing state where needed.
 * @returns Initial checkers state with board, side to move, quiet counter, and repetition history.
 */
export function newGame() {
    const board = Array(64).fill(0);
    for (let r=0;r<8;r++) for(let c=0;c<8;c++) if ((r+c)%2) board[r*8+c] = r<3 ? -1 : r>4 ? 1 : 0;
    const state={board,turn:1,quiet:0,repetitions:[]};state.repetitions=[keyOf(state)];return state;
}
/**
 * Test whether a coordinate lies within the board or convex boundary.
 *
 * @param r - Zero-based board row to test.
 * @param c - Zero-based board column to test.
 * @returns True if the row and column are valid coordinates on the eight-by-eight board.
 */
const inside=(r,c)=>r>=0&&r<8&&c>=0&&c<8;
/**
 * Return the legal row directions for a checkers man or king.
 *
 * @param piece - Signed piece value: sign identifies the side; magnitude one is a man and two is a king.
 * @returns Allowed row increments for the piece, including both directions for kings.
 */
const directions=(piece)=>Math.abs(piece)===2 ? [-1,1] : [-sideOf(piece)];
/**
 * Test whether a man reaches the promotion row.
 *
 * @param piece - Signed piece value: sign identifies the side; magnitude one is a man and two is a king.
 * @param row - Zero-based board row used to check promotion eligibility.
 * @returns True when the man reaches its side's promotion row; otherwise false.
 */
const crowns=(piece,row)=>Math.abs(piece)===1 && (piece>0 ? row===0 : row===7);
/**
 * Explore capture chains recursively; mandatory captures take priority over ordinary moves.
 *
 * @param state - Checkers position with its signed-piece board, side to move, quiet counter, and repetition history.
 * @returns Complete legal moves, restricted to capture chains when captures are available.
 */
export function legalMoves(state) {
    const captures=[];const moves=[];
    /**
     * Explore all continuations of a checkers capture sequence on copied boards.
     *
     * @param board - Current board representation, copied before exploring a capture continuation.
     * @param position - Current zero-based board square in the recursive capture chain.
     * @param piece - Signed piece value: sign identifies the side; magnitude one is a man and two is a king.
     * @param path - Ordered board squares visited by the capture sequence so far.
     * @param taken - Squares already captured along the currently explored jump sequence.
     * @returns No value is returned; updates the current state, scene, or interface.
     */
    function jump(board,position,piece,path,taken) {
        let continued=false;
        const row=Math.floor(position/8),col=position%8;
        for(const dy of directions(piece)) for(const dx of [-1,1]) {
            const r=row+2*dy,c=col+2*dx;if(!inside(r,c))continue;
            const middle=(row+dy)*8+col+dx,to=r*8+c;
            if(sideOf(board[middle])!==-state.turn||board[to])continue;
            continued=true;const next=board.slice();next[position]=0;next[middle]=0;next[to]=piece;
            const nextPath=[...path,to],nextTaken=[...taken,middle];
            if(crowns(piece,r))captures.push({from:path[0],path:nextPath,captures:nextTaken});
            else jump(next,to,piece,nextPath,nextTaken);
        }
        if(!continued&&taken.length)captures.push({from:path[0],path,captures:taken});
    }
    for(let from=0;from<64;from++) {
        const piece=state.board[from];if(sideOf(piece)!==state.turn)continue;
        jump(state.board,from,piece,[from],[]);
        const row=Math.floor(from/8),col=from%8;
        for(const dy of directions(piece))for(const dx of [-1,1]) {
            const r=row+dy,c=col+dx;if(inside(r,c)&&!state.board[r*8+c])moves.push({from,path:[from,r*8+c],captures:[]});
        }
    }
    return captures.length?captures:moves;
}
/**
 * Create the next board, remove captured pieces, crown eligible men, and update draw tracking.
 *
 * @param state - Checkers position with its signed-piece board, side to move, quiet counter, and repetition history.
 * @param move - Legal move descriptor containing origin, destination/path, and capture or promotion data.
 * @returns New game state after the move, with the original board left unchanged.
 */
export function applyMove(state,move) {
    const board=state.board.slice(),piece=board[move.from],to=move.path.at(-1);
    board[move.from]=0;for(const square of move.captures)board[square]=0;
    board[to]=crowns(piece,Math.floor(to/8))?sideOf(piece)*2:piece;
    const next={board,turn:-state.turn,quiet:move.captures.length||Math.abs(piece)===1?0:state.quiet+1,repetitions:[]};
    next.repetitions=[...(state.repetitions??[]),keyOf(next)];return next;
}
/**
 * Detect a side with no legal moves or a draw by quiet moves/repetition.
 *
 * @param state - Checkers position with its signed-piece board, side to move, quiet counter, and repetition history.
 * @returns Win/draw information if the game has ended, otherwise null.
 */
export function outcome(state) {
    if(!legalMoves(state).length)return {winner:-state.turn};
    if(state.quiet>=80)return {draw:'40 moves each without a capture or a man moving'};
    if((state.repetitions??[]).filter(key=>key===keyOf(state)).length>=3)return {draw:'threefold repetition'};
    return null;
}
/**
 * Score material, promotion progress, and central position from the current side's perspective.
 *
 * @param state - Checkers position with its signed-piece board, side to move, quiet counter, and repetition history.
 * @returns Position score from the perspective of the side to move.
 */
function evaluation(state) {
    let result=0;
    for(let i=0;i<64;i++) {
        const piece=state.board[i];if(!piece)continue;
        const row=Math.floor(i/8),col=i%8;
        const advance=piece>0?7-row:row;
        result+=sideOf(piece)*((Math.abs(piece)===2?180:100+advance*6)+(3.5-Math.abs(col-3.5))*3);
    }
    return result*state.turn;
}
/**
 * Use iterative-deepening negamax with alpha-beta pruning until the search deadline.
 *
 * @param state - Checkers position with its signed-piece board, side to move, quiet counter, and repetition history.
 * @param options - Configuration object (defaults to an empty object).
 * @param options.maxDepth - Maximum game-tree depth to search. Default: 6.
 * @param options.timeLimit - Search time budget in milliseconds. Default: 650.
 * @returns Chosen legal move descriptor, or null if the game has ended.
 */
export function chooseMove(state,{maxDepth=6,timeLimit=650}={}) {
    if(outcome(state))return null;
    const deadline=performance.now()+timeLimit,timeout=Symbol();
    /**
     * Sort legal moves so captures are searched before quiet moves.
     *
     * @param moves - Legal move descriptors to order before game-tree search.
     * @returns The input move array sorted with captures first.
     */
    const ordered=(moves)=>moves.sort((a,b)=>b.captures.length-a.captures.length);
    /**
     * Search legal continuations using negamax and alpha-beta pruning within the time budget.
     *
     * @param position - Current zero-based board square in the recursive capture chain.
     * @param depth - Remaining number of search plies to explore before static evaluation.
     * @param alpha - Lower score bound used by alpha-beta pruning.
     * @param beta - Upper score bound used by alpha-beta pruning.
     * @param ply - Number of half-moves searched from the root; used to prefer earlier wins.
     * @returns Best score found for the current search node, relative to its side to move.
     */
    function search(position,depth,alpha,beta,ply) {
        if(performance.now()>deadline)throw timeout;
        const end=outcome(position);if(end)return end.winner?-100000+ply:0;
        if(!depth)return evaluation(position);
        let best=-Infinity;
        for(const move of ordered(legalMoves(position))) {
            const score=-search(applyMove(position,move),depth-1,-beta,-alpha,ply+1);
            best=Math.max(best,score);alpha=Math.max(alpha,score);if(alpha>=beta)break;
        }
        return best;
    }
    const moves=ordered(legalMoves(state));let best=moves[0];
    for(let depth=1;depth<=maxDepth;depth++) {
        let candidate=best,score=-Infinity;
        try {
            for(const move of moves) {
                const value=-search(applyMove(state,move),depth-1,-Infinity,-score,1);
                if(value>score){score=value;candidate=move;}
            }
            best=candidate;if(score>99000)break;
        }catch(error){if(error!==timeout)throw error;break;}
    }
    return best;
}
