import express, { response } from 'express'
import axios from 'axios';
import Pool from "pg-pool";

import config from './config/index.js';
import bodyParser from 'body-parser';

const pool = new Pool({
  user: config.pg.user,
  database: config.pg.database,
  password: config.pg.password,
  port: config.pg.port,
  host: config.pg.host,
});

let bussy = false;

const app = express()
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const runQuery = async function (client, query) {
    try {
      var result = await client.query(query.text, query.values)
      return result
    } finally {
        
    }
  }

const scrapeReezo = async function(client, scrape) {
    for(const el of scrape.data.ads.ads){
        let query = {
            text: "SELECT * FROM public.reezocar_scrapes WHERE brand = $1 AND model = $2 AND mileage = $3 AND price = $4 and year = $5",
            values: [el.brand,el.model,el.mileage,el.price,el.year]
        }
    
        const length = await runQuery(client, query).then(result=>{
            return result.rows.length
        }).catch(e => {
            console.error(el, e.message, e.stack)
        })

        if(length !== 0) continue
    
        query = {
            text: "INSERT INTO reezocar_scrapes (reezo_id, title, brand, model, energy, gearbox, mileage, price, year) \
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
            values: [el._id, el.title, el.brand, el.model, el.energy, el.gearbox, el.mileage, el.price, el.year]
        }
        await runQuery(client, query).then(result=>{
            
        }).catch(e => {
            console.error(el, e.message, e.stack)
        }) 
        
    }
};

const looper = async function(query){
    var client = await pool.connect()
    console.log("Client Connected")

    let from = (query.variables.query.from)? query.variables.query.from : 0
    let result

    do{
        console.log(new Date().toISOString().replace(/T/, ' ').replace(/\..+/, ''), "Starting from:", from)
        query.variables.query.from = from
        result = await fetchReezo(query).then((scrape)=>{
            return scrape
        }).catch(error=>{
            console.log(error)
        })
        await scrapeReezo(client, result)
        from+=100
    }while(from<result.data.ads.count)

    client.release()
    console.log("Client disconnected")

    return "Looper is done!"
}

function fetchReezo(data){
    return axios.get("https://gqlaws.reezocar.com/graphql", {
        data: data
    }).then(response=>{
        return response.data
    }).catch(error=>{
        console.log ("------------------- Reezo scrape error -------------------")
        throw new Error(error);
    })
}

app.post('/test', (req, res) => {
    if(bussy){
        res.send("Server is currently bussy, please try again later")
    }else {
        res.status(202).send("Accepted, in progress!")
        bussy = true
        looper(req.body).then((response)=>{
            bussy = false
            console.log(response)
        }).catch(error=>{
            console.log(error)
        })
    }
})

app.get('/', (req,res)=>{
    res.send(`Server is working, bussy: ${bussy}`)
})

app.listen(config.port, () => {
    console.log(`Example app listening on port ${config.port}`)
})