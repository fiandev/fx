async function getCurrencyRates (currency, pairs = ["idr"]) {
  const url = "https://pwapi.ex2b.com/";
  const requestData = {
    operationName: "GetConversionRates",
    variables: {
      from: currency.toUpperCase(),
      to: (Array.isArray(pairs) ? pairs : [pair.toUpperCase()]).map(pair => pair.toUpperCase()).join(",")
    },
    query: `query GetConversionRates($from: String!, $to: String!) {
      rates: allConversionRates(from: $from, to: $to) {
        from
        to
        multiplier
        __typename
      }
    }`
  };
  
  const requestOptions = {
    method: "POST",
    headers: {
      "Accept": "*/*",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestData)
  };
  
  const [data, error] = await request(url, requestOptions);
  
  let rates = {};
  
  for (let rate of data.data.rates) {
    pairs.forEach((pair) => {
      if (rate.to.toUpperCase() === pair.toUpperCase()) rates[pair] = rate.multiplier;
    })
  }
  
  return rates;
}

async function getPairStats ({ pair, lot = 1, currency = "usd"}) {
  const url = "https://pwapi.ex2b.com/";
  const requestData = {
    operationName: "Calculate",
    variables: {
      input: {
        account_type: "mt5_mini_real_vc",
        instrument: `${pair.toUpperCase()}m`,
        currency: currency.toUpperCase(),
        leverage: 2000,
        lot: lot
      }
    },
    query: `mutation Calculate($input: CalculationInput!) {
      calculate(input: $input) {
        currency
        margin
        pip_value
        swap_long
        swap_short
        spread
        commission
        __typename
      }
    }`
  };
  
  const requestOptions = {
    method: "POST",
    headers: {
      "Accept": "*/*",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestData)
  };

  const [data, error] = await request(url, requestOptions);
  
  return data.data.calculate
}


async function request (url, options) {
  return new Promise((resolve, reject) => {
    try {
      fetch(url, options)
        .then(res => res.json())
        .then(data => resolve([data, null]))
        .catch(err => resolve([null, err]));
    } catch (unExpectError) {
      reject(uneExpectError);
    }
  });
}

function $(selector) {
  let doms = document.querySelectorAll(selector);
  return doms.length > 1 ? doms : doms[0];
}

function changeInputValue (selector, value) {
  const previousValue = window[encodeURI(selector)] || null;
  const dom = $(selector);
  
  dom.classList.remove("up")
  dom.classList.remove("down")
  dom.classList.remove("stun")
  
  if (previousValue && value > previousValue) dom.classList.add("up")
  if (previousValue && value < previousValue) dom.classList.add("down")
  if (previousValue && value == previousValue) dom.classList.add("stun")
  
  dom.value = value;
  window[encodeURI(selector)] = value;
}

function createNode (tagName = "div", attrs = {}) {
  let node = document.createElement(tagName);
  
  for (let key of Object.keys(attrs)) {
    node[key] = attrs[key];
  }
  
  return node;
}

function resetValue (selector) {
  $(selector).value = null;
}

[
  "usdjpy", 
  "eurusd",
  "gbpusd",
  "xauusd",
  "xauaud",
  "btcusd",
  "btcjpy",
  "ethusd",
  "audusd",
  "hkdjpy",
  "usoil",
].sort().map((pair) => {
  $("#pair").appendChild(createNode("option", {
    "value": pair.toUpperCase(),
    "text": pair.toUpperCase(),
  }));
});

const userCurrency = localStorage.getItem("userCurrency") || prompt("enter your currency code [Ex: IDR]:").toUpperCase();
localStorage.setItem("userCurrency", userCurrency);

$("#usdprice-label").innerHTML = `USD/${ userCurrency}`;

let tick = setInterval( async function(){
  
  try {
    const rates = await getCurrencyRates("USD", [userCurrency]);
    
    changeInputValue("#usdprice", rates[userCurrency]);
  } catch (err) {
    console.log(err)
  }
}, 500);

window.currencyTick = null;
window.currencyRate = null;

$("#pair").addEventListener("change", async function(e){
  let pair = e.target.value;
  let [from, to] = [pair.slice(0, 3), pair.slice(3)];
  
  if (window.currencyTick) {
    clearInterval(window.currencyTick);
    window.currencyRate = null;
    resetValue("#TP");
    resetValue("#entry");
    resetValue("#SL");
  }
  
  window.currencyTick = setInterval( async function(){
    window.currencyRate = (await getCurrencyRates(from, [to]))[to];
    
    let stats = await getPairStats({
      pair: pair,
      lot: $("#lot").value,
      currency: userCurrency
    });
    let riskValue = Math.floor($("#balance").value * ($("#risk").value * 0.01));
    let spreadSize = Number(stats.spread) / Number(stats.pip_value);
    
    changeInputValue("#pipvalue", stats.pip_value.toLocaleString());
    changeInputValue("#maxpip", Math.floor(riskValue / stats.pip_value));
    changeInputValue("#spread", stats.spread.toLocaleString());
    changeInputValue("#price", window.currencyRate.toLocaleString());
    changeInputValue("#spreadSize", `${ Number(spreadSize).toFixed(2) } pips / ${ spreadSize * 10 } points`);
  }, 500);
})


$("#SL").addEventListener("change", function(e){
  let SL = e.target.value;
  let points = Number($("#entry").value) - SL;
  let pips = Math.floor(points / 10);
  let TP = Number($("#entry").value) + (points * 2);
  
  console.log(pips)
  changeInputValue("#TP", TP);
  
});

$("#entry").addEventListener("change", function(e){
  let points = Number(e.target.value) - Number($("#SL").value);
  let pips = Math.floor(points / 10);
  let TP = Number(e.target.value) + (points * 2);
  
  changeInputValue("#pips", pips)
  changeInputValue("#loss", `${ (pips * Number($("#pipvalue").value)).toLocaleString() } ${ userCurrency }`)
  changeInputValue("#win", `${ userCurrency }. ${ (pips * Number($("#pipvalue").value) * 2).toLocaleString() } ${ userCurrency }`)
});

async function riskManagement () {
  let risk = Number($("#risk").value);
  let balance = Number($("#balance").value);
  let riskValue = Math.floor(balance * (risk * 0.01));
      riskValue = riskValue === 0 ? Number(balance * (risk * 0.01)).toFixed(2) : riskValue;
  
  $("#riskValue").value = `${ riskValue.toLocaleString() } ${ userCurrency }`;
}

$("#risk").addEventListener("change", riskManagement);
$("#balance").addEventListener("change", riskManagement);
$("#riskValue").addEventListener("change", riskManagement);

riskManagement();