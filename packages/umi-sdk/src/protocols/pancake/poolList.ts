import Decimal from "decimal.js";
import { getCoinProfileByType } from "../../../../../apps/ui/src/config/coinList";
import { fetchAccountResources, getTypeArgsFromStructTag } from "../../aptos";
import { CoinAmount } from "../../CoinAmount";
import { protocolBook } from "../../protocolList";
import { CalcOutputAmount, PoolStatus } from "../../types";
import { curveConstantProduct } from "../../umi/curves";
import { PancakeLiquidityPool } from "./types";

export const fetchPancakePools = async (): Promise<PoolStatus[]> => {
  let ownerAccount = protocolBook.pancake.accounts().pool;
  const data = await fetchAccountResources(ownerAccount);
  if (data.isOk()) {
    const pools = data.value
      .filter((d) =>
        d.type.startsWith(protocolBook.pancake.structs().TokenPairReserve)
      )
      .flatMap((resource) => {
        const res = resource.data as PancakeLiquidityPool;

        const [coinTypeX, coinTypeY] = getTypeArgsFromStructTag(resource.type);

        const coinXInfo = getCoinProfileByType(coinTypeX);
        const coinYInfo = getCoinProfileByType(coinTypeY);

        if (!(coinXInfo && coinYInfo)) return [];

        const coinX = new CoinAmount(coinXInfo, res.reserve_x);
        const coinY = new CoinAmount(coinYInfo, res.reserve_y);

        let pool: PoolStatus = {
          protocolName: "pancake",
          resourceType: resource.type,
          ownerAccount,
          pair: {
            name: `${coinX.coinInfo.symbol}-${coinY.coinInfo.symbol}`,
            coinX,
            coinY,
          },
          calcOutputAmount: calcSwapOutput,
        };
        return pool;
      });

    return pools;
  }
};

const calcSwapOutput: CalcOutputAmount = (
  sourceCoinAmount: CoinAmount,
  pool: PoolStatus
) => {
  let feeRate = new Decimal(3e-3);

  const [reserveSource, reserveTarget] =
    pool.pair.coinX.coinInfo.type === sourceCoinAmount.coinInfo.type
      ? [pool.pair.coinX, pool.pair.coinY]
      : [pool.pair.coinY, pool.pair.coinX];

  // if (curveType.endsWith('Uncorrelated')) {
  const fee = new CoinAmount(
    sourceCoinAmount.coinInfo,
    sourceCoinAmount.amount.mul(feeRate)
  );
  const sourceCoinSubsFees = sourceCoinAmount.amount.sub(fee.amount);

  const outputAmount = curveConstantProduct(
    sourceCoinSubsFees,
    reserveSource.amount,
    reserveTarget.amount
  );

  return {
    outputCoinAmount: new CoinAmount(reserveTarget.coinInfo, outputAmount),
    fees: [fee],
  };
};
