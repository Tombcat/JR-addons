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
    } catch (e) {
        throw new Error('error while fetching query');
    } finally {
        
    }
  }

const scrapeReezo = async function(client, scrape) {
    for(const el of scrape.data.ads.ads){
        try {
            let query = {
                text: "SELECT * FROM public.reezocar_scrapes WHERE brand = $1 AND model = $2 AND mileage = $3 AND price = $4 and year = $5",
                values: [el.brand,el.model,el.mileage,el.price,el.year]
            }
        
            const length = await runQuery(client, query)

            if(length !== 0) continue
        
            query = {
                text: "INSERT INTO reezocar_scrapes (reezo_id, title, brand, model, energy, gearbox, mileage, price, year) \
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
                values: [el._id, el.title, el.brand, el.model, el.energy, el.gearbox, el.mileage, el.price, el.year]
            }
            await runQuery(client, query)

        } catch (e){
            console.log(e.message," \ ", e.stack)
            throw new Error("Test")
        }
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
        result = await fetchReezo(query)
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

const getSimilar = async (src) => {

    var client = await pool.connect()
    console.log("Client Connected")

    // prepare query to get values from original vehicle
    let query = {
        text: "SELECT * FROM public.vehicle_revisions WHERE id IN (SELECT last_revision FROM public.vehicles WHERE id = $1)",
        values: [src]
    }

    //Run query to get original car values and store it as ORG
    const org = await runQuery(client, query).then(result=>{
        return result.rows[0]
    }).catch(e => {
        console.error(e.message, e.stack)
    })

     //Find price of offer duration 12
    const findOffer = (array)=>{
        let offer = array.find(element => element.duration == 12)
        if(offer){
            return offer.price
        }else {
            offer = array.find(element=> element.duration == org.offers[0].duration)
            if(offer){
                return offer.price
            }else return undefined
        }
    }

    //Prepare query for a similar cars search
    query = {
        text: "SELECT vr.* FROM public.vehicle_revisions vr WHERE id IN \
                (SELECT last_revision FROM public.vehicles) \
            AND status = 'available'\
            and configuration->>'type' like $1 \
            AND configuration->>'doors' like $2  \
            AND configuration->>'seats' like $3 \
            AND configuration->>'fuel' like $4 \
            AND configuration->>'gear' like $5 \
            AND configuration->>'critair' like $6 \
            Limit 12",
        values: [org.configuration.type, org.configuration.doors, org.configuration.seats, org.configuration.fuel, org.configuration.gear, org.configuration.critair]
    }

    let list = []

    //Run query and get a list of similar cars
    list = list.concat(await runQuery(client, query).then(result=>{
        return result.rows
    }).catch(e => {
        console.error(e.message, e.stack)
    }))

    //Delete doors and seats
    if(list.length < 6){
        query = {
            text: "SELECT vr.* FROM public.vehicle_revisions vr WHERE id IN \
                    (SELECT last_revision FROM public.vehicles) \
                AND status = 'available'\
                and configuration->>'type' like $1 \
                AND configuration->>'fuel' like $2 \
                AND configuration->>'gear' like $3 \
                AND configuration->>'critair' like $4 \
                Limit "+12-list.length,
            values: [org.configuration.type, org.configuration.fuel, org.configuration.gear, org.configuration.critair]
        }
        list = list.concat(await runQuery(client, query).then(result=>{
            return result.rows
        }).catch(e => {
            console.error(e.message, e.stack)
        }))
    }

    const orgOffer = findOffer(org.offers)

    //sort by price
    if(orgOffer && list){
        list.sort((a, b) => {
            return (findOffer(a.offers) - orgOffer) - (findOffer(b.offers) - orgOffer);
        });
    }

    //If we have less than 3 similar vehicles, trim data to only the same type.
    if(list.length < 3){
        query = {
            text: "SELECT vr.* FROM public.vehicle_revisions vr WHERE id IN \
                    (SELECT last_revision FROM public.vehicles) \
                AND status = 'available'\
                and configuration->>'type' like $1 \
                limit "+3-list.length,
            values: [org.configuration.type]
        }
        list = list.concat(await runQuery(client, query).then(result=>{
            return result.rows
        }).catch(e => {
            console.error(e.message, e.stack)
        }))
    }

    client.release()
    console.log("Client disconnected")

    return {
        found: list.length,
        rows: list
    }
}

app.get('/similar/:id', (req, res) => {
    console.log("Requested similar cars to id:", req.params.id)
    getSimilar(req.params.id).then(result=>{
        res.status(200).send(result)
    }).catch(e => {
        console.error(e.message, e.stack)
    })
})

app.post('/test', (req, res) => {
    if(bussy){
        res.status(201).send("Server is currently bussy, please try again later")
    }else {
        res.status(202).send("Accepted, in progress!")
        bussy = true
        looper(req.body).then((response)=>{
            bussy = false
            console.log(response)
        }).catch(error=>{
            bussy = false
            console.log(error)
        })
    }
})

app.get('/', (req,res)=>{
    res.status(201).send(new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '')+` - Server is working, bussy: ${bussy}`)
})

app.listen(config.port, () => {
    console.log(`Example app listening on port ${config.port}`)
})