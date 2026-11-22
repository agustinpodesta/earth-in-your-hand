# Earth in Your Hand · Live Weather

**Try it:** https://earth-in-your-hand.vercel.app (Chrome, allow the camera)

A hand-gesture globe with live clouds, rain, tropical cyclones and other disasters. It's based on
[Earth in Your Hand](https://github.com/n07eo/Earth-in-Your-Hand) by n07eo.

## Run it

```bash
node server.mjs
```

Then open http://localhost:8140 in Chrome and allow camera access. Node 18+ is required, and there's nothing to install.

The server hosts the page plus two small endpoints:

- `/api/preview?url=…` looks up a news article's own share image (`og:image`) for the thumbnails in the details card.
- `/api/gdelt?q=…` searches the GDELT news index for local coverage. GDELT allows one request every 5 seconds,
  so the endpoint queues requests and caches results for 30 minutes.

Local news only shows headlines that name the storm, or a town or region near the event. The towns come from
`data/places.json`, which is Natural Earth's populated places reduced to name, region, country and coordinates.
If you open `index.html` without the server, the page still works but only searches GDACS, and headlines show the
outlet's logo instead of the article photo.

## Zooming in

Scroll (or pinch with both hands) to zoom from the whole globe down to about 60×.

- **Sharper imagery:** past 3×, once the view settles for half a second, the page fetches sharper relief, live clouds and
  rain for just the area in view from NASA GIBS. It lays these over the globe, like a map loading higher-zoom tiles.
- **More detail as you go:** province/state borders and names, and then the larger cities, appear progressively.
  Labels never overlap; more important names win the space.
- **Kept light on purpose:** at most 60 labels (22 cities) show at once, towns under 50,000 people only appear when
  you're very close, and coastlines stay at 1:50m. The 1:10m set was about 950k line points and made rotation lag
  alongside webcam hand tracking.
- **Data files:** `data/admin1-lines.json` and `data/admin1-labels.json` are Natural Earth 1:10m provinces/states,
  simplified to about 3 km. `data/places.json` holds the cities and towns.

## Deploy (free)

The folder deploys to Vercel as is. `index.html` is served statically and `api/preview.js` runs as a serverless function.

## Data (all free, no keys)

- **Disasters, cyclone tracks and forecasts, exposure estimates, news headlines:** GDACS
- **Live clouds (GOES-East/West, Himawari IR), daily NOAA-20 imagery, GPM IMERG rain, Blue Marble base map:** NASA GIBS
- **Borders:** Natural Earth via world-atlas
- **Click-for-weather:** Open-Meteo
- **Storm background:** Wikipedia
- **Local news:** GDACS / Europe Media Monitor and the GDELT news index; nearby towns from Natural Earth

This isn't an official warning source.

## License

The original Earth in Your Hand is by n07eo and has no license. My additions are MIT. See `LICENSE`.
