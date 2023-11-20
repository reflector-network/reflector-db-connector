const { Asset } = require('stellar-base')
const { init, aggregateTrades } = require('../src')

function toStellarAsset(asset) {
    if (asset.code === 'XLM') {
        return Asset.native()
    }
    const [code, issuer] = asset.code.split(':')
    return new Asset(code, issuer)
}

function normalizeTimestamp(timestamp, timeframe) {
    return Math.floor(timestamp / timeframe) * timeframe
}

const {connectionString, baseAsset, assets, contract, decimals, timeframe} = require('./investigation-config.json')
init({ connectionString })

function getPrices() {
    const now = normalizeTimestamp(Date.now(), timeframe)

    console.log(now)

    aggregateTrades({
        contract,
        baseAsset: toStellarAsset(baseAsset),
        assets: assets.map(toStellarAsset),
        decimals,
        from: now / 1000,
        period: timeframe / 1000
    }).then(console.log).catch(console.error)

    setTimeout(getPrices, timeframe)
}

getPrices()