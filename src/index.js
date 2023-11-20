const DbConnector = require('./db-connector')
const { parseStateData, encodeContractId, parseAccountSigners } = require('./contract-state-parser')
const { DexTradesAggregator } = require('./dex-trades-aggregator')
const { Asset } = require('stellar-base')

/**
 * @typedef {Object} TradeAggregationParams
 * @property {string} contract - The contract identifier.
 * @property {string} baseAsset - The base asset symbol.
 * @property {string[]} assets - An array of asset symbols to aggregate trades for.
 * @property {number} decimals - The number of decimals to consider for price aggregation.
 * @property {number} from - The starting point (timestamp/block number) to fetch trades from.
 * @property {number} period - The period over which to aggregate trades.
 */

/**
 * @typedef {Object} AggregatedTradeResult
 * @property {Object} prices - The aggregated prices.
 * @property {string} admin - The admin address.
 * @property {number|string} lastTimestamp - The last timestamp processed.
 */

/**
 * @typedef {Object} AccountProps
 * @property {bigint} sequence - The sequence number of the account.
 * @property {number[]} thresholds - The thresholds array for the account.
 * @property {Signer[]} signers - An array of signers associated with the account.
 */

/**
 * @typedef {Object} Signer
 * @property {string} address - The signer's address.
 * @property {number} weight - The signer's weight.
 */

/**
 * Initialize StellarCore database connection
 * @param {String|{user: String, database: String, password: String, host: String, [port]: Number}} dbConnectionProperties
 * @returns {{
 *   aggregateTrades: (params: TradeAggregationParams) => Promise<AggregatedTradeResult>,
 *   retrieveAccountProps: (account: string) => Promise<AccountProps>
 *   close: () => Promise<void>
 * }}
 */
function init(dbConnectionProperties) {
    const db = new DbConnector(dbConnectionProperties)
    return {
        aggregateTrades: async ({ contract, baseAsset, assets, decimals, from, period }) => {
            const tradesAggregator = new DexTradesAggregator(convertToStellarAsset(baseAsset), assets.map(a => convertToStellarAsset(a)))
            const contractData = await db.fetchContractState(encodeContractId(contract))
            //retrieve previous prices from contract state
            const parsedContractState = parseStateData(contractData)
            //fetch and process tx results
            await db.fetchProcessTxResults(from, from + period, r => tradesAggregator.processTxResult(r))
            //aggregate prices and merge with previously set prices
            const prices = tradesAggregator.aggregatePrices(parsedContractState.prices, BigInt(decimals))
            return {
                prices,
                admin: parsedContractState.admin,
                lastTimestamp: parsedContractState.lastTimestamp
            }
        },
        retrieveAccountProps: async (account) => {
            const accountProps = await db.fetchAccountProps(account)
            if (accountProps.signers) {
                accountProps.signers = parseAccountSigners(accountProps.signers)
            }
            return accountProps
        },
        close: async () => await db.close()
    }
}

function convertToStellarAsset(asset) {
    switch (asset.type) {
        case 1: // Stellar asset
            if (!asset.code)
                throw new Error(`Asset code is required`)
            const [code, issuer] = asset.code.split(':')
            if (code === 'XLM' && !issuer)
                return Asset.native()
            else if (issuer)
                return new Asset(code, issuer)
            else
                throw new Error(`Unsupported asset: ${asset.code}`)
        default:
            throw new Error(`Unsupported asset type: ${asset.type}`)
    }
}

module.exports = { init }