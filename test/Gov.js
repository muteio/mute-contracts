/*
  MIT License
  Copyright (c) 2020 mute.io.

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
*/

const { accounts, contract } = require('@openzeppelin/test-environment');
const { expect } = require('chai');
var Web3 = require("web3");
let web3 = new Web3();
const {
  BN,           // Big Number support
  constants,    // Common constants, like the zero address and largest integers
  expectEvent,  // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
  time,
} = require('@openzeppelin/test-helpers');

const Mute = contract.fromArtifact('Mute');
const Voice = contract.fromArtifact('Voice');

const MuteSwap = contract.fromArtifact('MuteSwap');
const MuteVault = contract.fromArtifact('MuteVault');
const GovFunding = contract.fromArtifact('GovFunding');
const GovCoordinator = contract.fromArtifact('GovCoordinator');

const BigNumber = require('bignumber.js');
const DECIMALS = 18;
function toTokenDenomination (x) {
  return new BigNumber(x).times(10 ** DECIMALS).toFixed();
}

const INITIAL_SUPPLY = toTokenDenomination(1);
const INITIAL_SUPPLY_VOICE = toTokenDenomination(60000);

const TAX_FRACTION = 100;

describe('GovernanceTests:Create', function () {
  const [owner, user1, user2, user3, user4, user5, voiceGov, burn] =  accounts;

  beforeEach(async function () {
    this.value = new BN(1);

    this.mutetoken = await Mute.new();
    this.mutevault = await MuteVault.new(this.mutetoken.address, this.mutetoken.address)
    await this.mutetoken.initialize({from: owner});
    await this.mutetoken.setTaxReceiveAddress(this.mutevault.address, {from: owner});
    await this.mutetoken.setTaxFraction(TAX_FRACTION, {from: owner});
    this.swap = await MuteSwap.new(this.mutetoken.address, {from: owner});

    this.voicetoken = await Voice.new();
    this.voicevault = await MuteVault.new(this.voicetoken.address, this.voicetoken.address)
    await this.voicetoken.initialize({from: owner});
    this.voicetoken.setTaxReceiveAddress(this.voicevault.address, {from: owner});
    await this.voicetoken.setTaxFraction(TAX_FRACTION, {from: owner});

    this.GovCoordinator =  await GovCoordinator.new(this.voicetoken.address, 50)

    this.GovFunding = await GovFunding.new(this.GovCoordinator.address, this.mutetoken.address, 50)
    await this.mutetoken.addMinter(this.GovFunding.address, {from: owner});
    await this.mutetoken.addMinter(this.swap.address, {from: owner});

    await this.swap.addSwapInfo([owner], [toTokenDenomination(1)], {from: owner});
    await this.swap.claimSwap({from: owner});

    //await this.mutetoken.setDAO(this.GovCoordinator.address, {from: owner})
    //await this.voicetoken.setDAO(this.GovCoordinator.address, {from: owner})
  });


  describe('Mute::delegates', function () {
    it('should fix delegate transfer bug', async function () {
        await this.mutetoken.delegate(user3, {from: owner})
        await this.mutetoken.transfer(user1, toTokenDenomination(1), {from: owner} )
        await this.mutetoken.delegate(user3, {from: user1})
        await this.mutetoken.transfer(user2, toTokenDenomination(1), {from: user1} )
        await this.mutetoken.delegate(user3, {from: user2})
        await this.mutetoken.transfer(owner, toTokenDenomination(0.99), {from: user2} )

        expect(await this.mutetoken.totalSupply.call()).to.be.bignumber.equal(toTokenDenomination(1));
        expect(await this.mutetoken.getCurrentVotes(user3)).to.be.bignumber.equal(toTokenDenomination(0.9801));
        expect(await this.mutetoken.getCurrentVotes(owner)).to.be.bignumber.equal(toTokenDenomination(0));
        expect(await this.mutetoken.getCurrentVotes(user1)).to.be.bignumber.equal(toTokenDenomination(0));
        expect(await this.mutetoken.getCurrentVotes(user2)).to.be.bignumber.equal(toTokenDenomination(0));
    })
  });

  describe('Voice::delegates', function () {
    it('should fix delegate transfer bug', async function () {
        await this.voicetoken.transfer(burn, toTokenDenomination(59999), {from: owner} )
        await this.voicetoken.delegate(user3, {from: owner})
        await this.voicetoken.transfer(user1, toTokenDenomination(1), {from: owner} )
        await this.voicetoken.delegate(user3, {from: user1})
        await this.voicetoken.transfer(user2, toTokenDenomination(1), {from: user1} )
        await this.voicetoken.delegate(user3, {from: user2})
        await this.voicetoken.transfer(owner, toTokenDenomination(0.99), {from: user2} )

        expect(await this.voicetoken.totalSupply.call()).to.be.bignumber.equal(INITIAL_SUPPLY_VOICE);
        expect(await this.voicetoken.getCurrentVotes(user3)).to.be.bignumber.equal(toTokenDenomination(0.9801));
        expect(await this.voicetoken.getCurrentVotes(owner)).to.be.bignumber.equal(toTokenDenomination(0));
        expect(await this.voicetoken.getCurrentVotes(user1)).to.be.bignumber.equal(toTokenDenomination(0));
        expect(await this.voicetoken.getCurrentVotes(user2)).to.be.bignumber.equal(toTokenDenomination(0));
    })
  });

  describe('Governance Funding', function () {
    it('place a proposal and change a GovFunding variable as a MUTE holder', async function () {
      await this.swap.addSwapInfo([user1], [toTokenDenomination(4500000)], {from: owner});
      await this.swap.claimSwap({from: user1});
      await this.mutetoken.delegate(user1, {from: user1})
      await time.advanceBlock();
      await time.advanceBlock();

      var data = web3.eth.abi.encodeFunctionCall({
          name: 'changeVoteRequirement',
          type: 'function',
          inputs: [{ type: 'uint256', name: '_voteRequirement'}]
      }, [toTokenDenomination(100)]);

      expect(await this.GovFunding.voteRequirement.call()).to.be.bignumber.equal(toTokenDenomination(40000));

      var propID = await this.GovFunding.propose(this.GovFunding.address, data, "decrease the amount of mute needed to propose", {from: user1})
      propID = propID.logs[0].args[0];

      var votePeriod = await this.GovFunding.votingPeriod.call()
      var currentBlock = await time.latestBlock()
      await time.advanceBlock();

      await this.GovFunding.castVote(propID, true, {from: user1});
      //console.log(await this.GovFunding.state(propID.logs[0].args[0].toString()))

      await time.advanceBlockTo(currentBlock.add(votePeriod).toString());
      await time.advanceBlock();
      await this.GovFunding.execute(propID, {from: owner});
      expect(await this.GovFunding.voteRequirement.call()).to.be.bignumber.equal(toTokenDenomination(100));
    })

    it('should revert for outsiders (internal calls) and non voice gov contract (external calls)', async function () {
      await this.swap.addSwapInfo([user1], [toTokenDenomination(4500000)], {from: owner});
      await this.swap.claimSwap({from: user1});
      await this.mutetoken.delegate(user1, {from: user1})
      await time.advanceBlock();
      await time.advanceBlock();

      var data = web3.eth.abi.encodeFunctionCall({
          name: 'balanceOf',
          type: 'function',
          inputs: [{ type: 'address', name: 'account'}]
      }, [constants.ZERO_ADDRESS]);

      await expectRevert(
        this.GovFunding.propose(this.mutetoken.address, data, "decrease the amount of mute needed to propose", {from: user1}),
        'GovFunding::propose: only voice gov can propose',
      );

      await expectRevert(
        this.GovFunding.propose(this.GovFunding.address, data, "decrease the amount of mute needed to propose", {from: owner}),
        'GovFunding::propose: proposer votes below proposal threshold',
      );

      await expectRevert(
        this.GovFunding.propose(this.GovFunding.address, data, "decrease the amount of mute needed to propose", {from: voiceGov}),
        'GovFunding::propose: proposer votes below proposal threshold',
      );
    })
  });

  describe('Governance Coordinator', function () {
    it('place a proposal and change a GovCoordinator variable as a VOICE holder', async function () {
      await this.voicetoken.transfer(user1, toTokenDenomination(59999), {from: owner} )
      await this.voicetoken.delegate(user1, {from: user1})
      await time.advanceBlock();
      await time.advanceBlock();

      var data = web3.eth.abi.encodeFunctionCall({
        name: 'changeQuorumVotes',
        type: 'function',
        inputs: [{ type: 'uint256', name: '_quorumVotes'}]
      }, [toTokenDenomination(100)]);

      expect(await this.GovCoordinator.quorumVotes.call()).to.be.bignumber.equal(toTokenDenomination(4000));

      var propID = await this.GovCoordinator.propose(this.GovCoordinator.address, data, "decrease the amount of voice needed to propose", {from: user1})
      propID = propID.logs[0].args[0];

      var votePeriod = await this.GovCoordinator.votingPeriod.call()
      var currentBlock = await time.latestBlock()
      await time.advanceBlock();

      await this.GovCoordinator.castVote(propID, true, {from: user1});

      await time.advanceBlockTo(currentBlock.add(votePeriod).toString());
      await time.advanceBlock();
      await this.GovCoordinator.execute(propID, {from: owner});
      expect(await this.GovCoordinator.quorumVotes.call()).to.be.bignumber.equal(toTokenDenomination(100));
    })

    it('place a proposal to change the VOICE transaction tax', async function () {
      await this.voicetoken.transfer(user1, toTokenDenomination(59999), {from: owner} )
      await this.voicetoken.delegate(user1, {from: user1})
      await time.advanceBlock();
      await time.advanceBlock();

      var data = web3.eth.abi.encodeFunctionCall({
        name: 'setTaxFraction',
        type: 'function',
        inputs: [{ type: 'uint16', name: '_tax_fraction'}]
      }, [1000]);

      expect(await this.voicetoken.TAX_FRACTION.call()).to.be.bignumber.equal("100");

      var propID = await this.GovCoordinator.propose(this.voicetoken.address, data, "increase the voice transaction tax", {from: user1})
      propID = propID.logs[0].args[0];

      var votePeriod = await this.GovCoordinator.votingPeriod.call()
      var currentBlock = await time.latestBlock()
      await time.advanceBlock();

      await this.GovCoordinator.castVote(propID, true, {from: user1});

      await time.advanceBlockTo(currentBlock.add(votePeriod).toString());
      await time.advanceBlock();


      await expectRevert(
        this.GovCoordinator.execute(propID, {from: owner}),
        'GovCoordinator::execute: transaction Failed',
      );

      await this.voicetoken.setDAO(this.GovCoordinator.address, {from: owner})

      await this.GovCoordinator.execute(propID, {from: owner});

      expect(await this.voicetoken.TAX_FRACTION.call()).to.be.bignumber.equal("1000");
    })

    it('place a proposal to change the MUTE transaction tax', async function () {
      await this.voicetoken.transfer(user1, toTokenDenomination(59999), {from: owner} )
      await this.voicetoken.delegate(user1, {from: user1})
      await time.advanceBlock();
      await time.advanceBlock();

      var data = web3.eth.abi.encodeFunctionCall({
        name: 'setTaxFraction',
        type: 'function',
        inputs: [{ type: 'uint16', name: '_tax_fraction'}]
      }, [1000]);

      expect(await this.mutetoken.TAX_FRACTION.call()).to.be.bignumber.equal("100");

      var propID = await this.GovCoordinator.propose(this.mutetoken.address, data, "increase the mute transaction tax", {from: user1})
      propID = propID.logs[0].args[0];

      var votePeriod = await this.GovCoordinator.votingPeriod.call()
      var currentBlock = await time.latestBlock()
      await time.advanceBlock();

      await this.GovCoordinator.castVote(propID, true, {from: user1});

      await time.advanceBlockTo(currentBlock.add(votePeriod).toString());
      await time.advanceBlock();


      await expectRevert(
        this.GovCoordinator.execute(propID, {from: owner}),
        'GovCoordinator::execute: transaction Failed',
      );

      await this.mutetoken.setDAO(this.GovCoordinator.address, {from: owner})

      await this.GovCoordinator.execute(propID, {from: owner});

      expect(await this.mutetoken.TAX_FRACTION.call()).to.be.bignumber.equal("1000");
    })

    // we call govCoord with a proposal
    // Govcoord calls Gov funding with a proposal (mint to address, target is mute contract)
    it('place a funding proposal as a VOICE holder and get ratified by MUTE holders', async function () {
      await this.voicetoken.transfer(user1, toTokenDenomination(59999), {from: owner} )
      await this.voicetoken.delegate(user1, {from: user1})

      await this.swap.addSwapInfo([user1], [toTokenDenomination(4500000)], {from: owner});
      await this.swap.claimSwap({from: user1});
      await this.mutetoken.delegate(user1, {from: user1})

      await time.advanceBlock();
      await time.advanceBlock();

      // this is the data for our propose call
      var mint_data = web3.eth.abi.encodeFunctionCall({
        name: 'Mint',
        type: 'function',
        inputs: [{ type: 'address', name: 'account'}, { type: 'uint256', name: 'amount'}]
      }, [voiceGov, toTokenDenomination(1000)]);

      var data = web3.eth.abi.encodeFunctionCall({
        name: 'propose',
        type: 'function',
        inputs: [{ type: 'address', name: 'target'}, { type: 'bytes', name: 'data'}, { type: 'string', name: 'description'}]
      }, [this.mutetoken.address, mint_data, "Community funding proposal"]);

      expect(await this.mutetoken.balanceOf.call(voiceGov)).to.be.bignumber.equal("0");

      var propID = await this.GovCoordinator.propose(this.GovFunding.address, data, "Community funding proposal", {from: user1})
      propID = propID.logs[0].args[0];

      var votePeriod = await this.GovCoordinator.votingPeriod.call()
      var currentBlock = await time.latestBlock()
      await time.advanceBlock();

      await this.GovCoordinator.castVote(propID, true, {from: user1});

      await time.advanceBlockTo(currentBlock.add(votePeriod).toString());
      await time.advanceBlock();
      await this.GovCoordinator.execute(propID, {from: owner});
      await time.advanceBlock();
      await time.advanceBlock();

      // finished first step from voice holders
      // now ratify the vote with mute holders
      var prop = await this.GovFunding.proposalCount.call()

      var votePeriod = await this.GovFunding.votingPeriod.call()
      var currentBlock = await time.latestBlock()
      await time.advanceBlock();

      await this.GovFunding.castVote(prop, true, {from: user1});

      await time.advanceBlockTo(currentBlock.add(votePeriod).toString());
      await time.advanceBlock();
      await this.GovFunding.execute(propID, {from: owner});
      await time.advanceBlock();
      await time.advanceBlock();


      expect(await this.mutetoken.balanceOf(voiceGov)).to.be.bignumber.equal(toTokenDenomination(1000));

      await expectRevert(
        this.GovFunding.execute(propID, {from: owner}),
        'GovFunding::execute: proposal can only be succeeded to execute',
      );
    })

  });
});
