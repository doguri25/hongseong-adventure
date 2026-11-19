// Dump all places (id, name, type, lon, lat) from the game's content module as JSON.
import {PLACES} from '../../../dist/content.js';
console.log(JSON.stringify(PLACES.filter(p=>p.lon&&p.lat).map(p=>({id:p.id,name:p.name,short:p.short,type:p.type,category:p.category,lon:p.lon,lat:p.lat}))));
