var fs = require('fs')
var http = require('http')
var hyperquest = require('hyperquest')
var bl = require('bl')

var packagePath = '/root/packages/'
var skimDb = 'http://127.0.0.1:5984/skimdb/'
var registry = 'https://registry.npmjs.org'
var me = 'http://localhost:8000/'

function rewriteDistUrl(url) {
  return url.replace(/https?:\/\/registry\.npmjs.org\//g, me)
}

var server = http.createServer(function (req, res) {
  var split = req.url.split('/').filter(Boolean)
  console.log(split)
  if (split.length === 1) {
    console.log('fetching manifest', split[0])
    // We have a package manifest. Fetch it from our CouchDB, rewrite dist URLs
    // and return it back.
    var couchRequest = hyperquest(skimDb + split[0]);
    couchRequest.on('response', function (couchResponse) {
      console.log('got couch response for', split[0], +couchResponse.statusCode)

      couchResponse.pipe(bl(function (err, data) {
        var parsed, headers, stringified

        if (couchResponse.statusCode !== 200) {
          res.writeHead(couchResponse.statusCode, couchResponse.headers)
          return res.end(data)
        }

        try {
          parsed = JSON.parse(data)
        }
        catch (ex) {
          console.dir(ex)
        }

        Object.keys(parsed.versions).forEach(function (key) {
          var dist = parsed.versions[key].dist
          dist.tarball = rewriteDistUrl(dist.tarball)
        })

        stringified = JSON.stringify(parsed)
        headers = couchResponse.headers
        delete headers['content-length']

        res.writeHead(couchResponse.statusCode, headers)
        res.end(stringified)
      }))
    })
  }
  else if (split.length === 3) {
    var packageName = split[0]
    var ourPath = packagePath + '/' + packageName[0] + '/' + packageName +
      '_attachments/' + split[2];

    console.log('fetching package', packageName)
    console.log('looking up ' + ourPath + ' locally')

    fs.exists(ourPath, function (exists) {
      if (exists) {
        console.log('we have', packageName)
        return fs.createReadStream(ourPath).pipe(res)
      }

      console.log('failing back to original registry for ' + packageName)
      hyperquest(registry + req.url).pipe(res)
    })
  }
})

server.listen(8000)
