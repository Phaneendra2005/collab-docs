const { Client } = require('pg')
const client = new Client({
  connectionString: 'postgres://postgres:postgres@localhost:51214/template1',
})
client
  .connect()
  .then(() => client.query('SELECT * FROM "Operation"'))
  .then((res) => console.log(res.rows))
  .finally(() => client.end())
