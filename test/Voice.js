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

  This file tests if the Voice contract confirms to the ERC20 specification.
  These test cases are inspired from OpenZepplin's ERC20 unit test.
  https://github.com/OpenZeppelin/openzeppelin-solidity/blob/master/test/token/ERC20/ERC20.test.js
*/
const { accounts, contract } = require('@openzeppelin/test-environment');
const { expect } = require('chai');
const {
  BN,           // Big Number support
  constants,    // Common constants, like the zero address and largest integers
  expectEvent,  // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require('@openzeppelin/test-helpers');

const Voice = contract.fromArtifact('Voice');

const BigNumber = require('bignumber.js');
const DECIMALS = 18;
function toTokenDenomination (x) {
  return new BigNumber(x).times(10 ** DECIMALS).toFixed();
}

const INITIAL_SUPPLY = toTokenDenomination(60 * 10 ** 3);
const TAX_FRACTION = 100;


describe('Voice:Create', function () {
  const [owner, user1, user2, taxAddress] =  accounts;

  beforeEach(async function () {
    this.value = new BN(1);

    this.token = await Voice.new();
    await this.token.initialize({from: owner});
    this.token.setTaxReceiveAddress(taxAddress, {from: owner});
  });


  describe('Voice:totalSupply', function () {
    it('returns the total amount of tokens', async function () {
      expect(await this.token.totalSupply.call()).to.be.bignumber.eq(INITIAL_SUPPLY);
    });
  });

  describe('Voice:balanceOf', function () {
    describe('when the requested account has no tokens', function () {
      it('returns zero', async function () {
        expect(await this.token.balanceOf.call(user1)).to.be.bignumber.eq('0');
      });
    });

    describe('when the requested account has some tokens', function () {
      it('returns the total amount of tokens', async function () {
        expect(await this.token.balanceOf.call(owner)).to.be.bignumber.eq(INITIAL_SUPPLY);
      });
    });
  });

  describe('Voice:transfer', function () {
    it('reverts when transferring tokens to the zero address', async function () {
      // Conditions that trigger a require statement can be precisely tested
      await expectRevert(
        this.token.transfer(constants.ZERO_ADDRESS, this.value, { from: user1 }),
        'ERC20: transfer to the zero address',
      );
    });

    it('emits a Transfer event on successful transfers', async function () {
      const receipt = await this.token.transfer(
        user1, this.value, { from: owner }
      );

      // Event assertions can verify that the arguments are the expected ones
      expectEvent(receipt, 'Transfer', {
        from: owner,
        to: user1,
        value: this.value,
      });
    });

    it('updates balances on successful transfers', async function () {
      await this.token.transfer(user1, this.value, { from: owner });

      expect(await this.token.balanceOf(user1))
        .to.be.bignumber.equal(this.value);
    });

    it('applies universal tax of 1% for transfer', async function () {
      await this.token.transfer(user1, this.value, { from: owner });

      expect(await this.token.balanceOf(user1))
        .to.be.bignumber.equal(this.value);

      await this.token.transfer(user2, this.value, { from: user1 });

      const expectedValue = new BN(this.value - (TAX_FRACTION * this.value / 10000));
      const expectedTaxValue = new BN(TAX_FRACTION * this.value / 10000);

      expect(await this.token.balanceOf(user1))
        .to.be.bignumber.equal(expectedValue);

      expect(await this.token.balanceOf(taxAddress))
        .to.be.bignumber.equal(expectedTaxValue);
    });

    /*
    it('does not allow transfer when isPaused', async function () {
      await this.token.setIsPaused(true, {from: owner});
      await this.token.transfer(user1, this.value, { from: owner });

      expect(await this.token.balanceOf(user1))
        .to.be.bignumber.equal(this.value);

      await expectRevert(this.token.transfer(user2, this.value, { from: user1 }), 'ERC20: transfer is paused',);

    });
    */
  });

  describe('Voice:setTaxReceiveAddress', function () {
    it('reverts when not called by owner', async function () {
      // Conditions that trigger a require statement can be precisely tested
      await expectRevert(
        this.token.setTaxReceiveAddress(taxAddress, { from: user1 }),
        'Voice::onlyDAO: caller is not the dao',
      );
    });

  });

  describe('Voice:setAddressTax', function () {
    it('reverts when not called by owner', async function () {
      // Conditions that trigger a require statement can be precisely tested
      await expectRevert(
        this.token.setAddressTax(user1, { from: user1 }),
        'Voice::onlyDAO: caller is not the dao',
      );
    });

    it('emits LogSetAddressTax event on successful call', async function () {
      const receipt = await this.token.setAddressTax(user1, true, { from: owner });
    });
  });

  describe('Voice:setTaxFraction', function () {
    it('reverts when not called by owner', async function () {
      // Conditions that trigger a require statement can be precisely tested
      await expectRevert(
        this.token.setTaxFraction(50, { from: user1 }),
        'Voice::onlyDAO: caller is not the dao',
      );
    });

    it('emits LogChangeTaxFraction event on successful call', async function () {
      const receipt = await this.token.setTaxFraction(50, { from: owner });
    });
  });
});
