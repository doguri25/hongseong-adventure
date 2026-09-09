// Anchor the visible silhouette, not empty cell padding. Bottom/right are exclusive.
export function measureSpriteCells(rgba,width,height,columns,rows,regions){
 const frames=[];
 for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
  const region=regions?.[row*columns+col],x0=region?region[0]:Math.round(col*width/columns),x1=region?region[0]+region[2]:Math.round((col+1)*width/columns),y0=region?region[1]:Math.round(row*height/rows),y1=region?region[1]+region[3]:Math.round((row+1)*height/rows);
  let left=x1,right=x0,top=y1,bottom=y0;
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(rgba[(y*width+x)*4+3]>=96){left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);}
  if(right<=left){left=x0;right=x1;top=y0;bottom=y1;}
  frames.push({rect:[left,top,right-left,bottom-top],pivot:[(x0+x1)/2,bottom],cellHeight:height/rows});
 }
 return frames;
}
export function groundedRect(frame,x,y,size,cellHeight=frame.cellHeight){const[rX,rY,w,h]=frame.rect,scale=size/cellHeight;return[x+(rX-frame.pivot[0])*scale,y+(rY-frame.pivot[1])*scale,w*scale,h*scale];}
export function flightLift(mode,time,motion=true){return mode==='plane'?30+(motion?Math.sin(time/330)*2:0):0;}
